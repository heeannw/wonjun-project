const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${API_KEY}`

async function callGemini(prompt, maxTokens = 800) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API 오류 ${res.status}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '생성 실패'
}

export async function getTrendAnalysis(logs, pbs) {
  const logSummary = logs.slice(0, 14).map((l) =>
    `${l.date}: ${l.total_distance_m}m, RPE ${l.rpe}, 컨디션 ${l.condition_score}/10, 수면 ${l.sleep_hours}h, 전완근피로 ${l.forearm_fatigue}/10`
  ).join('\n')

  const pbSummary = pbs.slice(0, 6).map((p) =>
    `${p.event}: ${p.record_time} (${p.achieved_date})`
  ).join('\n')

  const prompt = `
너는 수영 장거리 전문 코치야. 아래는 원준 선수(18세, 자유형 장거리, 2028 LA 올림픽 목표)의 최근 훈련 데이터야.

[최근 훈련 기록 (최신순)]
${logSummary || '기록 없음'}

[주요 PB 기록]
${pbSummary || '기록 없음'}

다음 4가지를 분석해줘:
1. **훈련 부하 분석**: 최근 거리/RPE 트렌드 — 과부하인지, 적절한지, 부족한지
2. **컨디션 & 회복 분석**: 수면·컨디션·전완근 피로도 패턴에서 주의할 점
3. **성장 가능성 평가**: 현재 훈련 방향이 PB 단축에 효과적인지
4. **다음 2주 훈련 방향**: 구체적인 권고사항 2~3가지

각 항목을 2~3문장으로, 전체 10~15문장 이내로 한국어로 작성해. 선수를 격려하되 냉철하게 분석해.
`.trim()

  return callGemini(prompt, 800)
}

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

  return callGemini(prompt, 600)
}

export async function getCompetitionPrePlan(competition, pbs) {
  const pbSummary = pbs.slice(0, 8).map((p) => `${p.event}: ${p.record_time}`).join('\n')
  const events = competition.events?.join(', ') || '미정'
  const daysUntil = Math.ceil((new Date(competition.start_date) - new Date()) / (1000 * 60 * 60 * 24))

  const prompt = `
너는 수영 장거리 전문 코치야. 원준 선수(18세, 자유형 장거리, 2028 LA 올림픽 목표)의 시합 전 2주 훈련 플랜을 짜줘.

[시합 정보]
대회명: ${competition.name}
시합일: ${competition.start_date} (${daysUntil}일 후)
출전 종목: ${events}
풀 사이즈: ${competition.pool_type}

[현재 PB]
${pbSummary || '기록 없음'}

시합 2주 전부터 당일까지 주차별 훈련 방향을 작성해줘.

형식:
**D-14 ~ D-8 (1주차)**
- 훈련 방향 (2~3줄)

**D-7 ~ D-2 (2주차 테이퍼)**
- 훈련 방향 (2~3줄)

**D-1 (전날)**
- 준비 사항 (1~2줄)

**당일 워밍업**
- 권장 루틴 (1~2줄)

각 구간을 구체적이고 실용적으로, 거리/강도 수치 포함해서 한국어로 작성해.
`.trim()

  return callGemini(prompt, 900)
}

export async function getCompetitionPostPlan(competition, pbs) {
  const pbSummary = pbs.slice(0, 8).map((p) => `${p.event}: ${p.record_time}`).join('\n')
  const events = competition.events?.join(', ') || '미정'

  const prompt = `
너는 수영 장거리 전문 코치야. 원준 선수(18세, 자유형 장거리, 2028 LA 올림픽 목표)의 시합 후 1주 회복 플랜을 짜줘.

[시합 정보]
대회명: ${competition.name}
시합일: ${competition.start_date}
출전 종목: ${events}

[현재 PB]
${pbSummary || '기록 없음'}

시합 직후부터 1주일간 회복 및 재충전 플랜을 작성해줘.

형식:
**D+1 ~ D+2 (즉시 회복)**
- 내용 (2줄)

**D+3 ~ D+5 (적극적 회복)**
- 내용 (2줄)

**D+6 ~ D+7 (훈련 복귀)**
- 내용 (2줄)

**심리적 회복 포인트**
- 내용 (1~2줄)

구체적이고 실용적으로, 한국어로 작성해.
`.trim()

  return callGemini(prompt, 700)
}

export async function getGrowthSimulation(pbs, logs) {
  const pbSummary = pbs.slice(0, 10).map((p) => `${p.event}: ${p.record_time} (${p.achieved_date})`).join('\n')
  const recentAvgDist = logs.length
    ? Math.round(logs.slice(0, 14).reduce((s, l) => s + (l.total_distance_m || 0), 0) / Math.min(logs.length, 14))
    : 0

  const prompt = `
너는 수영 데이터 분석 전문가야. 원준 선수(18세, 자유형 장거리, 2028 LA 올림픽 목표)의 현재 데이터를 바탕으로 2026~2028 성장 시나리오를 시뮬레이션해줘.

[현재 PB 기록]
${pbSummary || '없음'}

[최근 평균 일일 훈련량]
${recentAvgDist}m/일

[참고]
- 2028 LA 올림픽: 2028년 7월 14일
- 현재 나이: 18세 (2008년생)
- 웨이트 트레이닝 미수행 상태 (성장 여지 최대)
- 2025 세계주니어 자유형 1500m 6위 입상

주요 종목(자유형 400m, 800m, 1500m, 개인혼영 400m)에 대해 아래 형식으로 작성해:

**자유형 1500m**
- 2026 예측: X:XX.XX (현재 대비 -X.X초)
- 2027 예측: X:XX.XX
- 2028 올림픽: X:XX.XX
- 근거: (1문장)

각 종목을 위 형식으로, 현실적이되 긍정적인 시나리오로 한국어로 작성해.
마지막에 **종합 전망** 2~3문장 추가.
`.trim()

  return callGemini(prompt, 900)
}

export async function getCompetitionEvaluation(competition, results, pbs, goals) {
  const resultSummary = results.map((r) =>
    `${r.event}: ${r.record_time ?? '기록없음'} / ${r.rank ? r.rank + '위' : '순위없음'}${r.heat ? ` (${r.heat})` : ''}${r.notes ? ` — ${r.notes}` : ''}`
  ).join('\n')

  const pbSummary = pbs.slice(0, 8).map((p) => `${p.event}: ${p.record_time}`).join('\n')
  const goalSummary = Object.entries(goals).map(([ev, g]) => `${ev}: 목표 ${g.target_time}`).join('\n') || '목표 없음'

  const prompt = `
너는 수영 장거리 전문 코치야. 원준 선수(18세, 자유형 장거리, 2028 LA 올림픽 목표)의 시합 결과를 분석해줘.

[시합 정보]
대회명: ${competition.name}
날짜: ${competition.start_date}
풀: ${competition.pool_type}

[시합 결과]
${resultSummary || '결과 없음'}

[현재 PB]
${pbSummary || '없음'}

[개인 목표]
${goalSummary}

다음 4가지를 분석해줘:
1. **결과 총평**: 목표 대비 성과, PB 경신 여부 (2문장)
2. **잘한 점**: 구체적으로 (1~2문장)
3. **개선할 점**: 레이스 전략, 체력, 기술 관점 (1~2문장)
4. **다음 시합 준비 방향**: 구체적 권고 (1~2문장)

전체 8~12문장, 한국어로, 냉철하지만 격려하는 톤으로 작성해.
`.trim()

  return callGemini(prompt, 800)
}
