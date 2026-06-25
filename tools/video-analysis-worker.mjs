import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const envPath = join(scriptDirectory, '.env.worker')

async function loadEnvFile() {
  try {
    const content = await readFile(envPath, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator < 1) continue
      const key = line.slice(0, separator).trim()
      const value = line.slice(separator + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // The validation below reports the missing file or variables.
  }
}

await loadEnvFile()

const requiredVariables = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY']
const missingVariables = requiredVariables.filter((key) => !process.env[key])
if (missingVariables.length) {
  console.error(`필수 설정이 없습니다: ${missingVariables.join(', ')}`)
  console.error(`tools/.env.worker.example을 tools/.env.worker로 복사한 뒤 값을 입력하세요.`)
  process.exit(1)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const workerName = process.env.VIDEO_WORKER_NAME || 'wonjun-pc'
const pollMilliseconds = Math.max(2000, Number(process.env.VIDEO_WORKER_POLL_MS) || 5000)
const geminiModel = process.env.GEMINI_VIDEO_MODEL || 'gemini-2.5-flash'
let stopping = false

async function findWingetExecutable(fileName, packagePrefix) {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return null
  const packagesDirectory = join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  try {
    const packageNames = await readdir(packagesDirectory)
    const packageName = packageNames.find((name) => name.startsWith(packagePrefix))
    if (!packageName) return null
    const packageDirectory = join(packagesDirectory, packageName)
    const pending = [packageDirectory]
    while (pending.length) {
      const directory = pending.shift()
      const entries = await readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(directory, entry.name)
        if (entry.isDirectory()) pending.push(fullPath)
        else if (entry.name.toLowerCase() === fileName.toLowerCase()) return fullPath
      }
    }
  } catch {
    return null
  }
  return null
}

const ytDlpCommand = await findWingetExecutable('yt-dlp.exe', 'yt-dlp.yt-dlp_') || 'yt-dlp'
const ffmpegCommand = await findWingetExecutable('ffmpeg.exe', 'yt-dlp.FFmpeg_') || 'ffmpeg'

function formatTimestamp(totalSeconds) {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      if (options.showOutput) process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      if (options.showOutput) process.stderr.write(chunk)
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} 실행 실패 (${code}): ${stderr.trim() || stdout.trim()}`))
    })
  })
}

async function ensureCommand(command, versionArgs) {
  try {
    await runCommand(command, versionArgs)
  } catch {
    throw new Error(`${command}을 찾을 수 없습니다. 먼저 설치하고 PATH에 추가해주세요.`)
  }
}

async function updateJob(jobId, values) {
  const { error } = await supabase
    .from('race_video_analysis_jobs')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', jobId)
  if (error) throw error
}

async function claimNextJob() {
  const { data: jobs, error } = await supabase
    .from('race_video_analysis_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  const job = jobs?.[0]
  if (!job) return null

  const { data, error: claimError } = await supabase
    .from('race_video_analysis_jobs')
    .update({
      status: 'processing',
      progress: 5,
      worker_name: workerName,
      started_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select()
    .maybeSingle()
  if (claimError) throw claimError
  return data || null
}

async function downloadClip(job, directory) {
  const outputTemplate = join(directory, 'race.%(ext)s')
  const section = `*${formatTimestamp(job.video_start_seconds)}-${formatTimestamp(job.video_end_seconds)}`
  await runCommand(ytDlpCommand, [
    '--no-playlist',
    '--ffmpeg-location', dirname(ffmpegCommand),
    '--download-sections', section,
    '--merge-output-format', 'mp4',
    '-f', '18/b[height<=360]',
    '-o', outputTemplate,
    job.video_url,
  ], { showOutput: true })

  const files = await readdir(directory)
  const videoName = files.find((name) => /^race\.(mp4|mkv|webm|mov)$/i.test(name))
  if (!videoName) throw new Error('잘린 경기 영상 파일을 찾지 못했습니다.')
  const videoPath = join(directory, videoName)
  const fileInfo = await stat(videoPath)
  if (!fileInfo.size) throw new Error('잘린 경기 영상 파일이 비어 있습니다.')
  return videoPath
}

async function uploadGeminiFile(videoPath) {
  const fileInfo = await stat(videoPath)
  const mimeType = 'video/mp4'
  const startResponse = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files?key=' + process.env.GEMINI_API_KEY, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(fileInfo.size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: basename(videoPath) } }),
  })
  if (!startResponse.ok) {
    throw new Error(`Gemini 업로드 시작 실패: ${await startResponse.text()}`)
  }
  const uploadUrl = startResponse.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('Gemini 업로드 주소를 받지 못했습니다.')

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(fileInfo.size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: createReadStream(videoPath),
    duplex: 'half',
  })
  if (!uploadResponse.ok) {
    throw new Error(`Gemini 영상 업로드 실패: ${await uploadResponse.text()}`)
  }
  return uploadResponse.json()
}

async function waitForFile(fileName) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${process.env.GEMINI_API_KEY}`)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload?.error?.message || 'Gemini 파일 상태 확인 실패')
    if (payload.state === 'ACTIVE') return payload
    if (payload.state === 'FAILED') throw new Error('Gemini가 영상 파일을 처리하지 못했습니다.')
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error('Gemini 영상 처리 대기 시간이 초과됐습니다.')
}

function parseGeminiJson(text) {
  const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Gemini 응답에서 분석 JSON을 찾지 못했습니다.')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function normalizeAnalysisResult(result, checkpoints) {
  const warnings = Array.isArray(result?.warnings) ? result.warnings.filter(Boolean) : []
  const seenLanes = new Set()
  const lanes = []

  for (const rawLane of Array.isArray(result?.lanes) ? result.lanes : []) {
    const laneNumber = Number(rawLane?.lane)
    if (!Number.isInteger(laneNumber) || laneNumber < 1 || laneNumber > 8) {
      warnings.push(`방송 자막에서 ${rawLane?.lane ?? '?'}레인으로 읽힌 항목은 제외했습니다.`)
      continue
    }
    if (seenLanes.has(laneNumber)) {
      warnings.push(`${laneNumber}레인이 중복 인식되어 첫 번째 값만 사용했습니다.`)
      continue
    }
    seenLanes.add(laneNumber)

    const splits = checkpoints.map((distance) => {
      const rawSplit = rawLane.splits?.find((split) => Number(split?.distance) === Number(distance))
      return {
        distance,
        time: typeof rawSplit?.time === 'string' ? rawSplit.time.trim() : '',
        rank: Number.isInteger(Number(rawSplit?.rank)) ? Number(rawSplit.rank) : null,
        confidence: Number.isFinite(Number(rawSplit?.confidence)) ? Number(rawSplit.confidence) : null,
      }
    })
    lanes.push({
      lane: laneNumber,
      name: String(rawLane?.name || '').trim(),
      splits,
    })
  }

  const missingLanes = Array.from({ length: 8 }, (_, index) => index + 1)
    .filter((laneNumber) => !seenLanes.has(laneNumber))
  if (missingLanes.length) warnings.push(`확인하지 못한 레인: ${missingLanes.join(', ')}`)

  return {
    lanes: lanes.sort((a, b) => a.lane - b.lane),
    warnings: [...new Set(warnings)],
    source: result?.source || 'broadcast_scoreboard_ocr',
  }
}

async function analyzeVideo(job, file) {
  const checkpoints = Array.isArray(job.checkpoint_distances) ? job.checkpoint_distances : []
  const prompt = `
이 영상은 수영 경기 방송의 실제 경기 구간만 잘라낸 영상이다.
종목은 ${job.event}, 총 거리는 ${job.race_distance}m, 풀 길이는 ${job.pool_length}m이다.

방송 화면의 경기 자막을 프레임별로 확인해 1~8레인의 선수명과 ${checkpoints.join('m, ')}m 지점 누적 기록 및 순위를 읽어라.
확실히 보이는 값만 기록하고 추측하지 마라. 같은 자막이 여러 프레임에 반복되면 가장 선명한 프레임을 사용하라.
시간은 "34.29" 또는 "1:12.84" 형식으로 작성한다.

JSON만 반환한다:
{
  "lanes": [
    {
      "lane": 1,
      "name": "선수명",
      "splits": [
        { "distance": ${checkpoints[0] || 50}, "time": "34.29", "rank": 1, "confidence": 0.92 }
      ]
    }
  ],
  "warnings": ["확인이 필요한 내용"],
  "source": "broadcast_scoreboard_ocr"
}`.trim()

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { file_data: { mime_type: file.mimeType || 'video/mp4', file_uri: file.uri } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini 분석 실패 (${response.status})`)
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || ''
  return normalizeAnalysisResult(parseGeminiJson(text), checkpoints)
}

async function processJob(job) {
  const directory = await mkdtemp(join(tmpdir(), 'wonjun-race-'))
  console.log(`\n[${new Date().toLocaleString('ko-KR')}] 작업 시작: ${job.id}`)
  try {
    await updateJob(job.id, { progress: 10 })
    const videoPath = await downloadClip(job, directory)
    await updateJob(job.id, { progress: 45 })
    const uploadedFile = await uploadGeminiFile(videoPath)
    const activeFile = await waitForFile(uploadedFile.file?.name)
    await updateJob(job.id, { progress: 70 })
    const result = await analyzeVideo(job, activeFile)
    await updateJob(job.id, {
      status: 'completed',
      progress: 100,
      result,
      completed_at: new Date().toISOString(),
    })
    console.log(`작업 완료: ${job.id}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`작업 실패: ${message}`)
    await updateJob(job.id, {
      status: 'failed',
      error_message: message.slice(0, 2000),
      completed_at: new Date().toISOString(),
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function main() {
  await access(envPath)
  await ensureCommand(ytDlpCommand, ['--version'])
  await ensureCommand(ffmpegCommand, ['-version'])
  console.log(`원준 영상 분석 도우미 실행 중 · ${workerName}`)
  console.log('웹에서 영상 자동 분석을 누르면 이 PC가 작업을 처리합니다. 종료: Ctrl+C')

  while (!stopping) {
    try {
      const job = await claimNextJob()
      if (job) await processJob(job)
      else await new Promise((resolve) => setTimeout(resolve, pollMilliseconds))
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      await new Promise((resolve) => setTimeout(resolve, pollMilliseconds))
    }
  }
}

process.on('SIGINT', () => {
  stopping = true
  console.log('\n현재 작업을 마친 뒤 종료합니다.')
})

main()
