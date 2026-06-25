const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isPublicYouTubeUrl(value: string) {
  try {
    const url = new URL(value)
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)
  } catch {
    return false
  }
}

function normalizeYouTubeUrl(value: string) {
  const url = new URL(value)
  if (url.hostname === 'youtu.be') {
    const videoId = url.pathname.split('/').filter(Boolean)[0]
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : value
  }
  const pathParts = url.pathname.split('/').filter(Boolean)
  if (pathParts[0] === 'live' || pathParts[0] === 'shorts' || pathParts[0] === 'embed') {
    const videoId = pathParts[1]
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : value
  }
  return value
}

function formatVideoTime(totalSeconds: number) {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function extractOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') return payload.output_text

  const steps = Array.isArray(payload.steps) ? payload.steps : []
  return steps
    .flatMap((step) => {
      if (!step || typeof step !== 'object') return []
      const content = Array.isArray((step as { content?: unknown[] }).content)
        ? (step as { content: unknown[] }).content
        : []
      return content
        .map((item) => {
          if (!item || typeof item !== 'object') return ''
          return typeof (item as { text?: unknown }).text === 'string'
            ? (item as { text: string }).text
            : ''
        })
        .filter(Boolean)
    })
    .join('\n')
}

function parseJsonText(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('AI 응답에서 JSON 결과를 찾지 못했습니다.')
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'POST 요청만 지원합니다.' }, 405)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return jsonResponse({ error: 'Supabase Secret에 GEMINI_API_KEY를 설정해주세요.' }, 500)

  try {
    const body = await request.json()
    const rawVideoUrl = String(body.videoUrl || '').trim()
    const event = String(body.event || '').trim()
    const raceDistance = Number(body.raceDistance)
    const startSeconds = Number(body.startSeconds) || 0
    const endSeconds = Number(body.endSeconds) || 0
    const checkpointDistances = Array.isArray(body.checkpointDistances)
      ? body.checkpointDistances.map(Number).filter((value: number) => value > 0)
      : []

    if (!isPublicYouTubeUrl(rawVideoUrl)) {
      return jsonResponse({ error: '공개 YouTube 영상 링크를 입력해주세요.' }, 400)
    }
    const videoUrl = normalizeYouTubeUrl(rawVideoUrl)
    if (!event || !raceDistance || !checkpointDistances.length) {
      return jsonResponse({ error: '종목과 레이스 거리 정보가 필요합니다.' }, 400)
    }

    const prompt = `
이 영상은 수영 경기 방송 영상이다.
영상 전체가 아니라 ${formatVideoTime(startSeconds)}부터 ${formatVideoTime(endSeconds || startSeconds + 600)} 사이만 분석한다.
종목은 ${event}, 총 거리는 ${raceDistance}m이다.

화면 왼쪽 아래 또는 하단에 표시되는 방송 경기 자막을 읽어라.
자막에는 1~8레인의 레인 번호, 선수명, ${checkpointDistances.join('m, ')}m 지점의 누적 기록, 구간 순위가 나타날 수 있다.
각 50m 터치 후 자막이 갱신되는 여러 프레임을 비교해 같은 숫자가 반복되는지 확인한다.

규칙:
1. 화면 자막에서 실제로 읽힌 값만 사용하고 추측하지 않는다.
2. 누적 기록은 "34.29", "1:12.84" 형식으로 작성한다.
3. 이전 누적 기록보다 작거나 같은 값은 오류로 판단하고 빈 문자열로 둔다.
4. 선수명은 자막에 보이는 대로 작성한다.
5. 기록이나 순위가 불확실하면 빈 값으로 두고 warnings에 이유를 쓴다.
6. 설명이나 마크다운 없이 아래 JSON 구조만 반환한다.

{
  "lanes": [
    {
      "lane": 1,
      "name": "선수명",
      "splits": [
        { "distance": ${checkpointDistances[0]}, "time": "34.29", "rank": 1, "confidence": 0.92 }
      ]
    }
  ],
  "warnings": ["불확실한 내용"],
  "source": "broadcast_scoreboard_ocr"
}
`.trim()

    const requestedModel = Deno.env.get('GEMINI_VIDEO_MODEL') || 'gemini-3.5-flash'
    const models = [...new Set([requestedModel, 'gemini-2.5-flash'])]
    let lastError = ''

    for (const model of models) {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model,
          input: [
            { type: 'video', uri: videoUrl },
            { type: 'text', text: prompt },
          ],
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        lastError = payload?.error?.message || `Gemini 영상 분석 오류 (${response.status})`
        const canTryFallback = model !== models.at(-1)
          && (response.status === 400 || [429, 500, 502, 503, 504].includes(response.status))
        if (canTryFallback) continue

        if (
          response.status === 400
          && (/invalid argument/i.test(lastError) || /fewer than \d+ images/i.test(lastError))
        ) {
          return jsonResponse({
            error: '영상 전체 길이가 Gemini의 YouTube 분석 한도를 넘었거나 영상 형식을 처리할 수 없습니다. 현재처럼 3시간이 넘는 중계 영상은 경기 구간만 잘라 업로드해야 정확하게 분석할 수 있습니다.',
            details: lastError,
          }, 400)
        }
        return jsonResponse({ error: lastError }, response.status)
      }

      const outputText = extractOutputText(payload)
      const parsed = parseJsonText(outputText)
      return jsonResponse({
        ...parsed,
        model,
        analyzedRange: {
          startSeconds,
          endSeconds,
        },
      })
    }

    return jsonResponse({ error: lastError || '영상 분석 서버가 응답하지 않습니다.' }, 503)
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : '영상 분석 중 오류가 발생했습니다.',
    }, 500)
  }
})
