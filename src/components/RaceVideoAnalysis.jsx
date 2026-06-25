import { useEffect, useRef, useState } from 'react'
import { BrainCircuit, Check, ChevronDown, ChevronUp, Pause, Play, RefreshCw, RotateCcw, Save, Trash2, Trophy, Video } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import TimeInput from './TimeInput'
import MeasuredChart from './MeasuredChart'
import VideoTimestampInput from './VideoTimestampInput'
import { supabase } from '../lib/supabase'
import { timeToSeconds } from '../lib/fina'

const EMPTY_LANES = Array.from({ length: 8 }, (_, index) => ({
  lane: index + 1,
  name: '',
  enabled: index === 3,
  splits: [],
}))
const LANE_COLORS = ['#60a5fa', '#a78bfa', '#f97316', '#22c55e', '#f43f5e', '#06b6d4', '#eab308', '#94a3b8']

function parseClock(value) {
  if (!value) return 0
  const parts = String(value).split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

function formatClock(totalSeconds, includeHundredths = true) {
  const total = Number(totalSeconds)
  if (!Number.isFinite(total) || total < 0) return '-'
  const minutes = Math.floor(total / 60)
  const seconds = total - minutes * 60
  const secondText = includeHundredths
    ? seconds.toFixed(2).padStart(5, '0')
    : Math.floor(seconds).toString().padStart(2, '0')
  return minutes > 0 ? `${minutes}:${secondText}` : secondText
}

function parseEventDistance(event) {
  const match = String(event || '').match(/(\d+)m/)
  return match ? Number(match[1]) : 200
}

function getYouTubeId(url) {
  const match = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/)
  return match?.[1] || ''
}

function normalizeLanes(lanes, checkpointCount) {
  return EMPTY_LANES.map((emptyLane) => {
    const lane = lanes?.find((item) => Number(item.lane) === emptyLane.lane) || emptyLane
    return {
      ...emptyLane,
      ...lane,
      enabled: Boolean(lane.enabled),
      splits: Array.from({ length: checkpointCount }, (_, index) => lane.splits?.[index] || ''),
    }
  })
}

function laneCumulativeSeconds(lane) {
  return lane.splits.map(timeToSeconds)
}

function getSegmentTime(lane, index) {
  const cumulative = laneCumulativeSeconds(lane)
  const current = cumulative[index]
  if (!current) return null
  const previous = index > 0 ? cumulative[index - 1] : 0
  return current - previous
}

function positionAt(lane, elapsed, checkpointDistance, raceDistance) {
  const cumulative = laneCumulativeSeconds(lane)
  const finalTime = cumulative[cumulative.length - 1]
  if (!finalTime || elapsed <= 0) return 0
  if (elapsed >= finalTime) return raceDistance

  for (let index = 0; index < cumulative.length; index += 1) {
    const current = cumulative[index]
    if (!current) return index * checkpointDistance
    if (elapsed <= current) {
      const previous = index > 0 ? cumulative[index - 1] : 0
      const duration = current - previous
      const fraction = duration > 0 ? (elapsed - previous) / duration : 0
      return Math.min(raceDistance, (index + Math.max(0, fraction)) * checkpointDistance)
    }
  }
  return raceDistance
}

function currentSpeed(lane, elapsed, checkpointDistance) {
  const cumulative = laneCumulativeSeconds(lane)
  for (let index = 0; index < cumulative.length; index += 1) {
    if (elapsed <= cumulative[index]) {
      const segment = getSegmentTime(lane, index)
      return segment ? checkpointDistance / segment : 0
    }
  }
  return 0
}

export default function RaceVideoAnalysis({ user, competitions, eventOptions, onResultSaved }) {
  const defaultEvent = eventOptions[0] || '자유형 200m'
  const [analyses, setAnalyses] = useState([])
  const [analysisId, setAnalysisId] = useState(null)
  const [title, setTitle] = useState('영상 레이스 분석')
  const [competitionId, setCompetitionId] = useState('')
  const [competitionName, setCompetitionName] = useState('')
  const [competitionDate, setCompetitionDate] = useState(new Date().toISOString().slice(0, 10))
  const [event, setEvent] = useState(defaultEvent)
  const [poolLength, setPoolLength] = useState(50)
  const [raceDistance, setRaceDistance] = useState(parseEventDistance(defaultEvent))
  const [videoUrl, setVideoUrl] = useState('')
  const [videoStart, setVideoStart] = useState('0:00')
  const [videoEnd, setVideoEnd] = useState('')
  const [athleteLane, setAthleteLane] = useState(4)
  const [lanes, setLanes] = useState(() => normalizeLanes(EMPTY_LANES, 4))
  const [comparisonId, setComparisonId] = useState('')
  const [isPbReference, setIsPbReference] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoAnalyzing, setAutoAnalyzing] = useState(false)
  const [message, setMessage] = useState('')
  const [showInput, setShowInput] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const animationRef = useRef(null)
  const lastFrameRef = useRef(null)
  const resultsRef = useRef(null)

  const checkpointDistance = Math.min(50, raceDistance)
  const checkpointCount = Math.max(1, Math.ceil(raceDistance / checkpointDistance))
  const checkpointDistances = Array.from({ length: checkpointCount }, (_, index) =>
    Math.min(raceDistance, (index + 1) * checkpointDistance)
  )

  const fetchAnalyses = async () => {
    const { data } = await supabase
      .from('race_video_analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setAnalyses(data || [])
  }

  useEffect(() => {
    let active = true
    supabase
      .from('race_video_analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (active) setAnalyses(data || [])
      })
    return () => {
      active = false
    }
  }, [user.id])

  const activeLanes = lanes.filter((lane) => lane.enabled && lane.splits.some(Boolean))
  const durationValues = activeLanes.map((lane) => laneCumulativeSeconds(lane).at(-1)).filter(Boolean)
  const raceDuration = durationValues.length ? Math.max(...durationValues) : 0

  useEffect(() => {
    if (!playing) {
      lastFrameRef.current = null
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      return undefined
    }

    const animate = (timestamp) => {
      if (lastFrameRef.current !== null) {
        const delta = ((timestamp - lastFrameRef.current) / 1000) * speed
        setElapsed((current) => {
          const next = Math.min(current + delta, raceDuration)
          if (raceDuration && next >= raceDuration) {
            window.setTimeout(() => setPlaying(false), 0)
          }
          return next
        })
      }
      lastFrameRef.current = timestamp
      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationRef.current)
  }, [playing, speed, raceDuration])

  const checkpointRows = checkpointDistances.map((distance, checkpointIndex) => {
    const timed = activeLanes
      .map((lane) => ({ lane, cumulative: laneCumulativeSeconds(lane)[checkpointIndex] }))
      .filter((row) => row.cumulative > 0)
      .sort((a, b) => a.cumulative - b.cumulative)
    const leader = timed[0]
    return {
      distance,
      entries: timed.map((row, index) => ({
        ...row,
        rank: index + 1,
        segment: getSegmentTime(row.lane, checkpointIndex),
        gap: leader ? row.cumulative - leader.cumulative : 0,
      })),
    }
  })
  const gapChartData = checkpointRows.map((row) => {
    const point = { distance: `${row.distance}m` }
    row.entries.forEach((entry) => {
      point[`lane-${entry.lane.lane}`] = Number(entry.gap.toFixed(2))
    })
    return point
  })
  const finalEntries = checkpointRows.at(-1)?.entries || []

  const comparison = analyses.find((item) => item.id === comparisonId)
  const comparisonLane = comparison?.lanes?.find((lane) => Number(lane.lane) === Number(comparison.athlete_lane))
  const currentAthlete = lanes.find((lane) => lane.lane === athleteLane)
  const replayLanes = comparisonLane && comparison.race_distance === raceDistance
    ? [...activeLanes, { ...comparisonLane, lane: 'PB', name: 'PB 레이스', virtual: true, enabled: true }]
    : activeLanes

  const positions = replayLanes.map((lane) => ({
    lane,
    position: positionAt(lane, elapsed, checkpointDistance, raceDistance),
  }))
  const leaderPosition = Math.max(0, ...positions.map((item) => item.position))
  const leaderLane = positions.find((item) => item.position === leaderPosition)?.lane
  const leaderSpeed = leaderLane ? currentSpeed(leaderLane, elapsed, checkpointDistance) : 0

  const updateLane = (laneNumber, field, value) => {
    setLanes((current) => current.map((lane) => lane.lane === laneNumber ? { ...lane, [field]: value } : lane))
  }

  const updateSplit = (laneNumber, splitIndex, value) => {
    setLanes((current) => current.map((lane) => {
      if (lane.lane !== laneNumber) return lane
      const splits = [...lane.splits]
      splits[splitIndex] = value
      return { ...lane, splits }
    }))
  }

  const handleEventChange = (value) => {
    const nextDistance = parseEventDistance(value)
    const nextCount = Math.ceil(nextDistance / Math.min(50, nextDistance))
    setEvent(value)
    setRaceDistance(nextDistance)
    setLanes((current) => normalizeLanes(current, nextCount))
  }

  const handlePoolLengthChange = (value) => {
    const nextPoolLength = Number(value)
    setPoolLength(nextPoolLength)
  }

  const resetAnalysis = () => {
    setAnalysisId(null)
    setTitle('영상 레이스 분석')
    setCompetitionId('')
    setCompetitionName('')
    setCompetitionDate(new Date().toISOString().slice(0, 10))
    setEvent(defaultEvent)
    setRaceDistance(parseEventDistance(defaultEvent))
    setPoolLength(50)
    setVideoUrl('')
    setVideoStart('0:00')
    setVideoEnd('')
    setAthleteLane(4)
    setLanes(normalizeLanes(EMPTY_LANES, 4))
    setComparisonId('')
    setIsPbReference(false)
    setElapsed(0)
    setPlaying(false)
    setMessage('')
  }

  const loadAnalysis = (analysis) => {
    const count = Math.ceil(analysis.race_distance / Math.min(50, analysis.race_distance))
    setAnalysisId(analysis.id)
    setTitle(analysis.title)
    setCompetitionId(analysis.competition_id || '')
    setCompetitionName(
      analysis.competition_name
      || competitions.find((competition) => competition.id === analysis.competition_id)?.name
      || '',
    )
    setCompetitionDate(analysis.competition_date || new Date().toISOString().slice(0, 10))
    setEvent(analysis.event)
    setRaceDistance(analysis.race_distance)
    setPoolLength(analysis.pool_length)
    setVideoUrl(analysis.video_url || '')
    setVideoStart(formatClock(analysis.video_start_seconds, false))
    setVideoEnd(analysis.video_end_seconds ? formatClock(analysis.video_end_seconds, false) : '')
    setAthleteLane(analysis.athlete_lane || 4)
    setLanes(normalizeLanes(analysis.lanes, count))
    setIsPbReference(Boolean(analysis.is_pb_reference))
    setElapsed(0)
    setPlaying(false)
    setShowInput(true)
  }

  const saveAnalysis = async () => {
    setSaving(true)
    setMessage('')
    const payload = {
      user_id: user.id,
      competition_id: competitionId || null,
      competition_name: competitionName.trim() || null,
      competition_date: competitionDate || null,
      title: title.trim() || '영상 레이스 분석',
      event,
      pool_length: poolLength,
      race_distance: raceDistance,
      video_url: videoUrl.trim() || null,
      video_start_seconds: parseClock(videoStart),
      video_end_seconds: videoEnd ? parseClock(videoEnd) : null,
      athlete_lane: athleteLane,
      lanes,
      is_pb_reference: isPbReference,
      updated_at: new Date().toISOString(),
    }
    const query = analysisId
      ? supabase.from('race_video_analyses').update(payload).eq('id', analysisId)
      : supabase.from('race_video_analyses').insert(payload)
    const { data, error } = await query.select().single()
    setSaving(false)
    if (error) {
      setMessage(error.message.includes('race_video_analyses')
        ? 'Supabase에서 race_video_analysis.sql을 먼저 실행해주세요.'
        : error.message)
      return
    }
    setAnalysisId(data.id)
    setMessage('영상 레이스 분석을 저장했습니다.')
    await fetchAnalyses()
  }

  const analyzeRecords = () => {
    const selectedLanes = lanes.filter((lane) => lane.enabled)
    if (!selectedLanes.length) {
      setMessage('분석할 선수를 한 명 이상 선택해주세요.')
      return
    }
    const missingRecord = selectedLanes
      .map((lane) => ({
        lane,
        splitIndex: lane.splits.findIndex((split) => !split),
      }))
      .find((item) => item.splitIndex >= 0)
    if (missingRecord) {
      setMessage(`${missingRecord.lane.lane}레인의 ${checkpointDistances[missingRecord.splitIndex]}m 누적 기록을 입력해주세요.`)
      return
    }
    setMessage('')
    setShowInput(false)
    window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const autoAnalyzeVideo = async () => {
    if (!videoUrl.trim()) {
      setMessage('공개 YouTube 영상 링크를 입력해주세요.')
      return
    }
    if (!videoEnd || parseClock(videoEnd) <= parseClock(videoStart)) {
      setMessage('경기 시작 위치보다 늦은 종료 위치를 입력해주세요.')
      return
    }

    setAutoAnalyzing(true)
    setMessage('영상 자막을 분석하고 있습니다. 긴 영상은 1~3분 정도 걸릴 수 있습니다.')
    const { data, error } = await supabase.functions.invoke('analyze-race-video', {
      body: {
        videoUrl: videoUrl.trim(),
        event,
        raceDistance,
        poolLength,
        startSeconds: parseClock(videoStart),
        endSeconds: parseClock(videoEnd),
        checkpointDistances,
      },
    })
    setAutoAnalyzing(false)

    if (error || data?.error) {
      setMessage(data?.error || error?.message || '영상 자동 분석에 실패했습니다.')
      return
    }

    const detectedLanes = Array.isArray(data?.lanes) ? data.lanes : []
    if (!detectedLanes.length) {
      setMessage('영상 자막에서 레인별 기록을 찾지 못했습니다. 영상 구간과 화질을 확인해주세요.')
      return
    }

    setLanes((current) => current.map((lane) => {
      const detected = detectedLanes.find((item) => Number(item.lane) === lane.lane)
      if (!detected) return lane
      const splits = checkpointDistances.map((distance) => {
        const split = detected.splits?.find((item) => Number(item.distance) === distance)
        return split?.time || ''
      })
      return {
        ...lane,
        enabled: splits.some(Boolean),
        name: detected.name || lane.name,
        splits,
      }
    }))
    setShowInput(true)
    const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : []
    setMessage(
      warnings.length
        ? `자동 입력 완료 · 확인 필요: ${warnings.join(' / ')}`
        : `${detectedLanes.length}개 레인의 자막 기록을 자동 입력했습니다. 오인식 여부를 확인해주세요.`,
    )
  }

  const saveCompetitionResult = async () => {
    const finalSeconds = currentAthlete ? laneCumulativeSeconds(currentAthlete).at(-1) : 0
    if (!competitionName.trim() || !finalSeconds) {
      setMessage('시합명과 원준 선수의 최종 누적 기록을 먼저 입력해주세요.')
      return
    }
    let targetCompetitionId = competitionId
    if (!targetCompetitionId) {
      const existingCompetition = competitions.find(
        (competition) => competition.name.trim().toLowerCase() === competitionName.trim().toLowerCase(),
      )
      targetCompetitionId = existingCompetition?.id || ''
    }
    if (!targetCompetitionId) {
      const { data: createdCompetition, error: competitionError } = await supabase
        .from('competitions')
        .insert({
          user_id: user.id,
          name: competitionName.trim(),
          start_date: competitionDate,
          end_date: competitionDate,
          pool_type: `${poolLength}m`,
          events: [event],
          notes: '영상 레이스 분석에서 등록',
        })
        .select()
        .single()
      if (competitionError) {
        setMessage(`시합 생성 실패: ${competitionError.message}`)
        return
      }
      targetCompetitionId = createdCompetition.id
      setCompetitionId(targetCompetitionId)
    }
    const finalCheckpoint = checkpointRows.at(-1)
    const athleteEntry = finalCheckpoint?.entries.find((entry) => entry.lane.lane === athleteLane)
    const { data, error } = await supabase.from('competition_results').insert({
      user_id: user.id,
      competition_id: targetCompetitionId,
      event,
      record_time: formatClock(finalSeconds),
      rank: athleteEntry?.rank || null,
      notes: `영상 레이스 분석 저장 · ${title}`,
    }).select().single()
    if (error) {
      setMessage(error.message)
      return
    }
    if (analysisId) {
      await supabase
        .from('race_video_analyses')
        .update({
          result_id: data.id,
          competition_id: targetCompetitionId,
          competition_name: competitionName.trim(),
          competition_date: competitionDate,
        })
        .eq('id', analysisId)
    }
    setMessage('원준 선수의 최종 기록을 시합 결과에 저장했습니다.')
    onResultSaved?.()
  }

  const deleteAnalysis = async (id) => {
    if (!confirm('이 영상 레이스 분석을 삭제할까요?')) return
    await supabase.from('race_video_analyses').delete().eq('id', id)
    if (analysisId === id) resetAnalysis()
    fetchAnalyses()
  }

  const youtubeId = getYouTubeId(videoUrl)
  const videoEmbedUrl = youtubeId
    ? `https://www.youtube.com/embed/${youtubeId}?start=${parseClock(videoStart)}`
    : ''

  const athleteCheckpointEntries = checkpointRows.map((row) => ({
    distance: row.distance,
    entry: row.entries.find((entry) => entry.lane.lane === athleteLane),
  }))
  const halfIndex = Math.ceil(checkpointCount / 2) - 1
  const athleteCumulative = currentAthlete ? laneCumulativeSeconds(currentAthlete) : []
  const frontHalf = athleteCumulative[halfIndex] || 0
  const finalTime = athleteCumulative.at(-1) || 0
  const backHalf = finalTime && frontHalf ? finalTime - frontHalf : 0

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-700/50 bg-[#1a1d27] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <Video size={17} className="text-cyan-400" />
              영상 레이스 분석
            </h2>
            <p className="mt-1 text-xs text-slate-500">방송 자막의 누적 기록을 입력하면 구간 기록과 움직이는 레이스를 생성합니다.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={resetAnalysis} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">
              새 분석
            </button>
            <button type="button" onClick={() => setShowInput((current) => !current)} className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">
              기록 입력 {showInput ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>
      </section>

      {showInput && (
        <section className="rounded-xl border border-slate-700/50 bg-[#1a1d27] p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs text-slate-400">
              분석 이름
              <input value={title} onChange={(eventObject) => setTitle(eventObject.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0f1117] px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-slate-400">
              시합명
              <input
                list="race-analysis-competitions"
                value={competitionName}
                onChange={(eventObject) => {
                  const value = eventObject.target.value
                  const matched = competitions.find((competition) => competition.name === value)
                  setCompetitionName(value)
                  setCompetitionId(matched?.id || '')
                  if (matched?.start_date) setCompetitionDate(matched.start_date)
                }}
                placeholder="기존 시합 선택 또는 직접 입력"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0f1117] px-3 py-2 text-sm text-white"
              />
              <datalist id="race-analysis-competitions">
                {competitions.map((competition) => <option key={competition.id} value={competition.name} />)}
              </datalist>
            </label>
            <label className="text-xs text-slate-400">
              시합 날짜
              <input type="date" value={competitionDate} onChange={(eventObject) => setCompetitionDate(eventObject.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0f1117] px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-slate-400">
              종목
              <select value={event} onChange={(eventObject) => handleEventChange(eventObject.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0f1117] px-3 py-2 text-sm text-white">
                {eventOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              풀 사이즈
              <select value={poolLength} onChange={(eventObject) => handlePoolLengthChange(eventObject.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0f1117] px-3 py-2 text-sm text-white">
                <option value={50}>50m</option>
                <option value={25}>25m</option>
              </select>
            </label>
            <label className="text-xs text-slate-400 md:col-span-2">
              YouTube 영상 링크
              <input value={videoUrl} onChange={(eventObject) => setVideoUrl(eventObject.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0f1117] px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-slate-400">
              경기 시작 위치
              <VideoTimestampInput
                value={videoStart}
                onChange={setVideoStart}
                placeholder="1:50:53"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0f1117] px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-slate-400">
              경기 종료 위치
              <VideoTimestampInput
                value={videoEnd}
                onChange={setVideoEnd}
                placeholder="1:54:20"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0f1117] px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          {videoEmbedUrl && (
            <div className="mt-4 aspect-video overflow-hidden rounded-lg border border-slate-700 bg-black">
              <iframe className="h-full w-full" src={videoEmbedUrl} title="시합 영상" allowFullScreen />
            </div>
          )}

          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="grid gap-2 text-[11px] text-slate-500" style={{ gridTemplateColumns: `54px 160px repeat(${checkpointCount}, minmax(96px, 1fr))` }}>
                <span>선택</span>
                <span>선수 / 레인</span>
                {checkpointDistances.map((distance) => <span key={distance}>{distance}m 누적</span>)}
              </div>
              <div className="mt-2 space-y-2">
                {lanes.map((lane) => (
                  <div key={lane.lane} className={`grid items-center gap-2 rounded-lg border p-2 ${lane.lane === athleteLane ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-800 bg-[#0f1117]'}`} style={{ gridTemplateColumns: `54px 160px repeat(${checkpointCount}, minmax(96px, 1fr))` }}>
                    <button type="button" onClick={() => updateLane(lane.lane, 'enabled', !lane.enabled)} className={`flex h-8 w-8 items-center justify-center rounded border ${lane.enabled ? 'border-green-500/40 bg-green-500/15 text-green-300' : 'border-slate-700 text-slate-600'}`}>
                      {lane.enabled && <Check size={14} />}
                    </button>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => { setAthleteLane(lane.lane); updateLane(lane.lane, 'enabled', true) }} className={`h-8 w-8 shrink-0 rounded-full text-xs font-bold ${lane.lane === athleteLane ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>{lane.lane}</button>
                      <input value={lane.name} onChange={(eventObject) => updateLane(lane.lane, 'name', eventObject.target.value)} placeholder={`레인 ${lane.lane}`} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" />
                    </div>
                    {checkpointDistances.map((distance, splitIndex) => (
                      <TimeInput
                        key={distance}
                        value={lane.splits[splitIndex] || ''}
                        onChange={(value) => updateSplit(lane.lane, splitIndex, value)}
                        placeholder={splitIndex === 0 ? '34.29' : '1:12.84'}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={isPbReference} onChange={(eventObject) => setIsPbReference(eventObject.target.checked)} />
              이 분석을 PB 기준 레이스로 지정
            </label>
            <button type="button" onClick={autoAnalyzeVideo} disabled={autoAnalyzing} className="ml-auto flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/15 px-4 py-2 text-sm font-semibold text-purple-200 hover:bg-purple-500/25 disabled:opacity-50">
              {autoAnalyzing ? <RefreshCw size={15} className="animate-spin" /> : <BrainCircuit size={15} />}
              {autoAnalyzing ? '영상 분석 중' : '영상 자동 분석'}
            </button>
            <button type="button" onClick={analyzeRecords} className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">
              <Play size={15} /> 기록 분석
            </button>
            <button type="button" onClick={saveAnalysis} disabled={saving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Save size={15} /> {saving ? '저장 중' : '분석 저장'}
            </button>
            <button type="button" onClick={saveCompetitionResult} className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-300">
              <Trophy size={15} /> 시합 결과에 저장
            </button>
          </div>
          {message && <p className="mt-3 text-xs text-cyan-300">{message}</p>}
        </section>
      )}

      <section ref={resultsRef} className="scroll-mt-4 rounded-xl border border-slate-700/50 bg-[#1a1d27] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">레이스 리플레이</h3>
            <p className="mt-1 text-xs text-slate-500">구간 누적 기록 사이를 평균 속도로 재현합니다.</p>
          </div>
          <label className="text-xs text-slate-400">
            PB 비교
            <select value={comparisonId} onChange={(eventObject) => setComparisonId(eventObject.target.value)} className="ml-2 rounded border border-slate-700 bg-[#0f1117] px-2 py-1.5 text-xs text-white">
              <option value="">사용 안 함</option>
              {analyses.filter((analysis) => analysis.event === event && analysis.id !== analysisId).map((analysis) => (
                <option key={analysis.id} value={analysis.id}>{analysis.is_pb_reference ? 'PB · ' : ''}{analysis.title}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPlaying((current) => !current)} disabled={!raceDuration} className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-40">
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" onClick={() => { setPlaying(false); setElapsed(0) }} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300">
            <RotateCcw size={15} />
          </button>
          <select value={speed} onChange={(eventObject) => setSpeed(Number(eventObject.target.value))} className="h-9 rounded-lg border border-slate-700 bg-[#0f1117] px-2 text-xs text-white">
            <option value={0.25}>0.25×</option>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
          <input type="range" min={0} max={raceDuration || 1} step={0.01} value={Math.min(elapsed, raceDuration || 0)} onChange={(eventObject) => { setPlaying(false); setElapsed(Number(eventObject.target.value)) }} className="min-w-[160px] flex-1" />
          <span className="w-20 text-right font-mono text-sm text-white">{formatClock(elapsed)}</span>
        </div>

        <div className="mt-5 space-y-2">
          {positions.map(({ lane, position }) => {
            const gapMeters = Math.max(0, leaderPosition - position)
            const gapSeconds = leaderSpeed > 0 ? gapMeters / leaderSpeed : 0
            return (
              <div key={lane.lane} className={`rounded-lg border px-3 py-2 ${lane.virtual ? 'border-yellow-500/30 bg-yellow-500/5' : lane.lane === athleteLane ? 'border-blue-500/40 bg-blue-500/5' : 'border-slate-800 bg-[#0f1117]'}`}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className={lane.virtual ? 'text-yellow-300' : lane.lane === athleteLane ? 'text-blue-300' : 'text-slate-300'}>
                    {lane.virtual ? 'PB' : `${lane.lane}레인`} · {lane.name || (lane.lane === athleteLane ? '원준' : '선수')}
                  </span>
                  <span className="text-slate-500">
                    {gapMeters < 0.05 ? '선두' : `+${gapSeconds.toFixed(2)}초 · ${gapMeters.toFixed(1)}m`}
                  </span>
                </div>
                <div className="relative h-8 overflow-hidden rounded bg-slate-900">
                  {checkpointDistances.slice(0, -1).map((distance) => (
                    <span key={distance} className="absolute inset-y-0 w-px bg-slate-700" style={{ left: `${(distance / raceDistance) * 100}%` }} />
                  ))}
                  <div className={`absolute top-1/2 h-5 w-9 -translate-y-1/2 rounded-full text-center text-sm transition-[left] duration-75 ${lane.virtual ? 'bg-yellow-500/25' : lane.lane === athleteLane ? 'bg-blue-500/30' : 'bg-slate-700'}`} style={{ left: `calc(${Math.min(100, (position / raceDistance) * 100)}% - 18px)` }}>
                    🏊
                  </div>
                </div>
              </div>
            )
          })}
          {!positions.length && <p className="py-8 text-center text-sm text-slate-500">선수를 선택하고 누적 기록을 입력해주세요.</p>}
        </div>
      </section>

      {activeLanes.length > 0 && (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-700/50 bg-[#1a1d27] p-4">
            <h3 className="font-semibold text-white">선두 격차 변화</h3>
            <p className="mt-1 text-xs text-slate-500">각 체크포인트에서 선두와 벌어진 초 차이입니다.</p>
            <MeasuredChart height={240} className="mt-4">
              <LineChart data={gapChartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#273244" />
                <XAxis dataKey="distance" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} unit="초" />
                <Tooltip contentStyle={{ backgroundColor: '#0f1117', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                {activeLanes.map((lane, index) => (
                  <Line
                    key={lane.lane}
                    type="monotone"
                    dataKey={`lane-${lane.lane}`}
                    name={`${lane.lane}레인 ${lane.name || ''}`}
                    stroke={LANE_COLORS[index % LANE_COLORS.length]}
                    strokeWidth={lane.lane === athleteLane ? 3 : 2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </MeasuredChart>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-[#1a1d27]">
            <div className="border-b border-slate-700/50 px-4 py-3">
              <h3 className="font-semibold text-white">선수 비교표</h3>
              <p className="mt-1 text-xs text-slate-500">최종 기록과 전·후반 페이스를 비교합니다.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">선수</th>
                    <th className="px-3 py-2 text-right">최종</th>
                    <th className="px-3 py-2 text-right">순위</th>
                    <th className="px-3 py-2 text-right">전반</th>
                    <th className="px-4 py-2 text-right">후반</th>
                  </tr>
                </thead>
                <tbody>
                  {finalEntries.map((entry) => {
                    const cumulative = laneCumulativeSeconds(entry.lane)
                    const front = cumulative[halfIndex] || 0
                    const finish = cumulative.at(-1) || 0
                    return (
                      <tr key={entry.lane.lane} className={`border-t border-slate-800 ${entry.lane.lane === athleteLane ? 'bg-blue-500/5' : ''}`}>
                        <td className="px-4 py-2 text-white">{entry.lane.lane}레인 · {entry.lane.name || '선수'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-300">{formatClock(finish)}</td>
                        <td className="px-3 py-2 text-right text-yellow-300">{entry.rank}위</td>
                        <td className="px-3 py-2 text-right text-slate-300">{formatClock(front)}</td>
                        <td className="px-4 py-2 text-right text-slate-300">{formatClock(finish - front)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {currentAthlete && finalTime > 0 && (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-[#1a1d27]">
            <div className="border-b border-slate-700/50 px-4 py-3">
              <h3 className="font-semibold text-white">원준 선수 구간 분석</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">지점</th>
                    <th className="px-4 py-2 text-right">구간 기록</th>
                    <th className="px-4 py-2 text-right">누적 기록</th>
                    <th className="px-4 py-2 text-right">순위</th>
                    <th className="px-4 py-2 text-right">선두 격차</th>
                    <th className="px-4 py-2 text-right">PB 대비</th>
                  </tr>
                </thead>
                <tbody>
                  {athleteCheckpointEntries.map(({ distance, entry }, index) => {
                    const pbCumulative = comparisonLane ? laneCumulativeSeconds(comparisonLane)[index] : 0
                    const pbDiff = entry && pbCumulative ? entry.cumulative - pbCumulative : null
                    return (
                      <tr key={distance} className="border-t border-slate-800">
                        <td className="px-4 py-2 text-white">{distance}m</td>
                        <td className="px-4 py-2 text-right text-slate-300">{entry?.segment ? formatClock(entry.segment) : '-'}</td>
                        <td className="px-4 py-2 text-right font-semibold text-blue-300">{entry ? formatClock(entry.cumulative) : '-'}</td>
                        <td className="px-4 py-2 text-right text-yellow-300">{entry ? `${entry.rank}위` : '-'}</td>
                        <td className="px-4 py-2 text-right text-slate-400">{entry ? `+${entry.gap.toFixed(2)}초` : '-'}</td>
                        <td className={`px-4 py-2 text-right ${pbDiff !== null && pbDiff <= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                          {pbDiff === null ? '-' : `${pbDiff > 0 ? '+' : ''}${pbDiff.toFixed(2)}초`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-slate-700/50 bg-[#1a1d27] p-4">
            <h3 className="font-semibold text-white">페이스 요약</h3>
            <div className="rounded-lg bg-[#0f1117] p-3">
              <p className="text-xs text-slate-500">전반</p>
              <p className="mt-1 text-lg font-bold text-white">{formatClock(frontHalf)}</p>
            </div>
            <div className="rounded-lg bg-[#0f1117] p-3">
              <p className="text-xs text-slate-500">후반</p>
              <p className="mt-1 text-lg font-bold text-white">{formatClock(backHalf)}</p>
            </div>
            <div className="rounded-lg bg-[#0f1117] p-3">
              <p className="text-xs text-slate-500">전·후반 차이</p>
              <p className={`mt-1 text-lg font-bold ${backHalf <= frontHalf ? 'text-green-400' : 'text-orange-400'}`}>
                {frontHalf && backHalf ? `${backHalf > frontHalf ? '+' : ''}${(backHalf - frontHalf).toFixed(2)}초` : '-'}
              </p>
            </div>
          </div>
        </section>
      )}

      {analyses.length > 0 && (
        <section className="rounded-xl border border-slate-700/50 bg-[#1a1d27] p-4">
          <h3 className="mb-3 font-semibold text-white">저장된 영상 분석</h3>
          <div className="space-y-2">
            {analyses.map((analysis) => (
              <div key={analysis.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#0f1117] px-3 py-2">
                <button type="button" onClick={() => loadAnalysis(analysis)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-white">{analysis.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{analysis.event} · {analysis.pool_length}m 풀 {analysis.is_pb_reference ? '· PB 기준' : ''}</p>
                </button>
                <button type="button" onClick={() => deleteAnalysis(analysis.id)} className="text-red-500/60 hover:text-red-400"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
