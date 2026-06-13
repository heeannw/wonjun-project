const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`

export async function getTrainingFeedback(todayLog, recentLogs) {
  const recentSummary = recentLogs.slice(0, 7).map((l) =>
    `${l.date}: ${l.total_distance_m}m, RPE ${l.rpe}, 컨디션 ${l.condition_score}, 수면 ${l.sleep_hours}h, 전완근피로 ${l.forearm_fatigue}`
  ).join('\n')

  const prompt = `
너는 수영 장거리 전문 코치야. 아래는 원준 선수(18세, 자유형 장거리 전문, 2028 LA 올림픽 목표)의 훈련 데이터야.

[오늘 훈련]
날짜: ${todayLog.date}
총 거리: ${todayLog.total_distance_m}m
주 종목: ${todayLog.main_event}
RPE(운동자각도): ${todayLog.rpe}/10
컨디션: ${todayLog.condition_score}/10
수면: ${todayLog.sleep_hours}시간
전완근 피로도: ${todayLog.forearm_fatigue}/10
${todayLog.notes ? `메모: ${todayLog.notes}` : ''}

[최근 7일 훈련 기록]
${recentSummary || '기록 없음'}

위 데이터를 바탕으로:
1. 오늘 훈련 상태 평가 (1~2문장)
2. 피로/컨디션 트렌드 분석 (1문장)
3. 내일 훈련 권고 (1문장)

총 3~4문장으로, 간결하고 구체적으로, 선수를 격려하는 톤으로 한국어로 작성해.
전완근 피로도가 7 이상이면 반드시 경고 메시지 포함.
`.trim()

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
    }),
  })

  if (!res.ok) throw new Error('Gemini API 오류')
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '피드백 생성 실패'
}
