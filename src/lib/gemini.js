const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`

function getGeminiErrorMessage(status, err) {
  const message = err?.error?.message || ''
  const reason = err?.error?.status || ''

  if (status === 429) {
    const detail = message || reason
    return detail
      ? `Gemini 사용량 제한에 걸렸습니다: ${detail}`
      : 'Gemini 사용량 제한에 걸렸습니다. 잠시 후 다시 시도해주세요.'
  }

  if (status === 400 || status === 403) {
    return message || `Gemini API 키 또는 권한 오류입니다. (${status})`
  }

  return message || `Gemini API 오류 ${status}`
}

function cleanGeminiText(text) {
  return (text || '생성 실패')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function calcAge(birthDate) {
  if (!birthDate) return new Date().getFullYear() - 2008
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function calcAgeAt(birthDate, targetDate) {
  const birth = new Date(birthDate || '2008-03-04')
  const target = new Date(targetDate)
  let age = target.getFullYear() - birth.getFullYear()
  const m = target.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && target.getDate() < birth.getDate())) age--
  return age
}

function ctx(profile) {
  const age = calcAge(profile?.birth_date)
  const olympicAge = calcAgeAt(profile?.birth_date || '2008-03-04', '2028-07-14')
  const name = profile?.name || '원준'
  const team = profile?.team ? ` (${profile.team})` : ''
  const coach = profile?.coach ? `, 코치: ${profile.coach}` : ''
  const events = profile?.main_events?.length ? profile.main_events.join(', ') : '자유형 장거리'
  const goal = profile?.goal || '2028 LA 올림픽 출전'
  const notes = profile?.notes ? `\n참고: ${profile.notes}` : ''
  return { age, olympicAge, name, intro: `${name} 선수(만 ${age}세${team}, 전문: ${events}, 목표: ${goal}${coach})`, notes }
}

async function callGemini(prompt, maxTokens = 800) {
  if (!API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY가 설정되어 있지 않습니다.')
  }

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
    throw new Error(getGeminiErrorMessage(res.status, err))
  }
  const data = await res.json()
  return cleanGeminiText(data.candidates?.[0]?.content?.parts?.[0]?.text)
}

export async function getTrendAnalysis(logs, pbs, profile) {
  const c = ctx(profile)
  const logSummary = logs.slice(0, 14).map((l) =>
    `${l.date}: ${l.total_distance_m}m, 운동강도 ${l.rpe}/10, 컨디션 ${l.condition_score}/10, 수면 ${l.sleep_hours}h, 신체피로 ${l.forearm_fatigue}/10`
  ).join('\n')
  const pbSummary = pbs.slice(0, 6).map((p) => `${p.event}: ${p.record_time} (${p.achieved_date})`).join('\n')

  const prompt = `
너는 수영 장거리 데이터 분석가다. 아래는 ${c.intro}의 최근 훈련 데이터다.${c.notes}

[최근 훈련 기록 - 최신순]
${logSummary || '기록 없음'}

[주요 PB 기록]
${pbSummary || '기록 없음'}

아래 형식 그대로 한국어로 작성해.
마크다운 문법(**, ###, -, *)은 사용하지 마.
선수에게 직접 말을 거는 문장, 과한 칭찬, "힘내자", "훌륭하다" 같은 표현은 쓰지 마.
차분한 코칭 리포트 톤으로, 판단과 근거를 짧게 써.

1. 훈련 부하
최근 거리와 운동 강도를 기준으로 과부하, 적정, 부족 중 하나로 판단한다. 근거를 2문장 이내로 쓴다.

2. 회복 상태
수면, 컨디션, 신체 피로도를 기준으로 회복 리스크를 판단한다. 근거를 2문장 이내로 쓴다.

3. 기록 향상 가능성
PB 기록과 최근 훈련 방향을 연결해서 현재 방향이 기록 단축에 도움이 되는지 평가한다. 2문장 이내로 쓴다.

4. 다음 2주 조정안
실행 가능한 조정안 3개를 번호 없이 한 줄씩 쓴다. 각 줄은 35자 이내로 쓴다.

마지막 문장은 전체 결론 1문장만 쓴다.
`.trim()

  return callGemini(prompt, 800)
}

function summarizeFeedbackContext(context = {}) {
  const strengthSummary = (context.strengthRecords || []).slice(0, 6).map((r) => {
    const load = [
      r.weight ? `${r.weight}kg` : null,
      r.reps ? `${r.reps}회` : null,
      r.sets ? `${r.sets}세트` : null,
    ].filter(Boolean).join(' ')
    return `${r.date}: ${r.exercise}${load ? ` ${load}` : ''}${r.notes ? `, ${r.notes}` : ''}`
  }).join('\n')

  const bodySummary = (context.bodyRecords || []).slice(0, 5).map((r) =>
    `${r.date}: 체중 ${r.weight ?? '-'}kg${r.body_fat ? `, 체지방 ${r.body_fat}%` : ''}${r.notes ? `, ${r.notes}` : ''}`
  ).join('\n')

  const resultMap = {}
  ;(context.competitionResults || []).forEach((r) => {
    if (!resultMap[r.competition_id]) resultMap[r.competition_id] = []
    resultMap[r.competition_id].push(r)
  })

  const today = new Date()
  const competitionSummary = (context.competitions || []).map((c) => {
    const diffDays = Math.ceil((new Date(c.start_date) - today) / (1000 * 60 * 60 * 24))
    const timing = diffDays >= 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`
    const events = Array.isArray(c.events) ? c.events.join(', ') : c.events || '종목 미정'
    const results = (resultMap[c.id] || []).slice(0, 3).map((r) =>
      `${r.event}${r.record_time ? ` ${r.record_time}` : ''}${r.rank ? ` ${r.rank}위` : ''}`
    ).join(' / ')
    return `${c.start_date} ${timing}: ${c.name} (${events})${results ? `, 결과: ${results}` : ''}${c.notes ? `, 메모: ${c.notes}` : ''}`
  }).join('\n')

  return {
    strengthSummary,
    bodySummary,
    competitionSummary,
  }
}

export async function getTrainingFeedback(todayLog, recentLogs, profile, context = {}) {
  const c = ctx(profile)
  const extra = summarizeFeedbackContext(context)
  const setSummary = Array.isArray(todayLog.sets) && todayLog.sets.length
    ? todayLog.sets.map((set, index) => {
        const total = (set.distance || 0) * (set.reps || 1) * (set.set_count || 1)
        const equipment = set.equipment?.length ? `, 장비 ${set.equipment.join(', ')}` : ''
        const cycle = set.cycle_minutes || set.cycle_seconds ? `, 사이클 ${set.cycle_minutes || 0}분 ${set.cycle_seconds || 0}초` : ''
        const dive = set.dive_count ? `, 다이브 ${set.dive_count}회` : ''
        const note = set.note ? `, ${set.note}` : ''
        return `${index + 1}. ${set.type} ${set.distance}m x ${set.reps}회 x ${set.set_count || 1}세트 (${total}m, ${set.intensity}${equipment}${cycle}${dive})${note}`
      }).join('\n')
    : ''
  const recentSummary = recentLogs.slice(0, 7).map((l) =>
    `${l.date}: ${l.total_distance_m}m, 운동강도 ${l.rpe}/10, 컨디션 ${l.condition_score}, 수면 ${l.sleep_hours}h, 신체피로 ${l.forearm_fatigue}`
  ).join('\n')

  const prompt = `
너는 수영 장거리 선수의 훈련 데이터를 분석하는 코치다. 아래 데이터를 종합해서 오늘 피드백을 작성한다.${c.notes}

[오늘 훈련]
날짜: ${todayLog.date}
총 거리: ${todayLog.total_distance_m}m
훈련 종목: ${todayLog.main_event}
운동 강도: ${todayLog.rpe}/10
컨디션: ${todayLog.condition_score}/10
수면: ${todayLog.sleep_hours}시간
신체 피로도: ${todayLog.forearm_fatigue}/10
${todayLog.notes ? `메모: ${todayLog.notes}` : ''}

[오늘 세트 구성]
${setSummary || '기록 없음'}

[최근 7일 훈련 기록]
${recentSummary || '기록 없음'}

[최근 근력 기록]
${extra.strengthSummary || '기록 없음'}

[최근 신체 기록]
${extra.bodySummary || '기록 없음'}

[시합 일정 및 최근 결과]
${extra.competitionSummary || '기록 없음'}

판단 기준:
1. 오늘 훈련량과 운동 강도
2. 최근 7일 피로 누적과 컨디션 변화
3. 최근 근력 훈련으로 인한 피로 가능성
4. 체중/체지방 등 신체 변화
5. 시합이 가까운지, 또는 시합 후 회복 기간인지

작성 형식:
1. 오늘 상태 판단: 1문장
2. 종합 리스크: 1문장
3. 다음 훈련 권고: 1문장
4. 주의할 점: 1문장

마크다운 문법은 쓰지 마.
과한 칭찬이나 응원 문구는 쓰지 마.
시합 D-14 이내면 기록 욕심보다 피로 관리와 테이퍼를 우선한다.
시합 D+7 이내면 회복과 몸 상태 확인을 우선한다.
신체 피로도가 7 이상이면 반드시 회복 또는 부하 조절 권고를 포함한다.
`.trim()

  return callGemini(prompt, 600)
}

export async function getMentalFeedback(journal, recentJournals = [], profile) {
  const c = ctx(profile)
  const recentSummary = recentJournals.slice(0, 7).map((j) =>
    `${j.date}: 감정 ${j.emotion}, 목표 "${j.final_goal || '-'}", 집중 "${j.todays_focus || '-'}", 개선 "${j.improve_point || '-'}"`
  ).join('\n')

  const prompt = `
너는 엘리트 수영 선수의 멘탈 루틴을 돕는 코치다. 아래 멘탈 일지를 보고 짧은 피드백을 작성한다.${c.notes}

[선수 정보]
${c.intro}

[오늘 멘탈 일지]
날짜: ${journal.date}
최종 목표: ${journal.final_goal || '-'}
오늘 집중한 것: ${journal.todays_focus || '-'}
잘한 점: ${journal.good_point || '-'}
더 해야 할 점: ${journal.improve_point || '-'}
감정: ${journal.emotion || '-'} ${journal.emotion_note || ''}
내일의 나에게: ${journal.message_to_tomorrow || '-'}

[최근 멘탈 흐름]
${recentSummary || '기록 없음'}

작성 형식:
1. 오늘 멘탈 상태 판단: 1문장
2. 목표 선명도 또는 감정 흐름: 1문장
3. 내일 실천할 행동: 1문장

마크다운 문법은 쓰지 마.
진단, 치료, 의학적 표현은 쓰지 마.
과한 응원보다 차분하고 구체적인 코칭 톤으로 작성해.
불안/피로가 반복되면 훈련 강도 조절이나 코치와의 공유를 권한다.
`.trim()

  return callGemini(prompt, 500)
}

export async function getMonthlyReportAnalysis(reportData, profile) {
  const c = ctx(profile)
  const {
    year,
    month,
    logs = [],
    monthPbs = [],
    bodyRecords = [],
    mentalLogs = [],
    strengthRecords = [],
    competitions = [],
    competitionResults = [],
    latestPbs = [],
  } = reportData

  const trainingSummary = logs.map((l) =>
    `${l.date}: ${l.main_event || '-'}, ${l.total_distance_m || 0}m, 운동강도 ${l.rpe}/10, 컨디션 ${l.condition_score}/10, 수면 ${l.sleep_hours}h, 신체피로 ${l.forearm_fatigue}/10${l.notes ? `, 메모: ${l.notes}` : ''}`
  ).join('\n')
  const pbSummary = monthPbs.map((p) => `${p.achieved_date}: ${p.event} ${p.record_time}`).join('\n')
  const latestPbSummary = latestPbs.map((p) => `${p.event}: ${p.record_time} (${p.achieved_date})`).join('\n')
  const bodySummary = bodyRecords.map((r) => `${r.date}: 체중 ${r.weight}kg${r.body_fat ? `, 체지방 ${r.body_fat}%` : ''}${r.notes ? `, ${r.notes}` : ''}`).join('\n')
  const mentalSummary = mentalLogs.map((m) =>
    `${m.date}: 감정 ${m.emotion || '-'} ${m.emotion_note || ''}, 목표 "${m.final_goal || '-'}", 집중 "${m.todays_focus || '-'}", 개선 "${m.improve_point || '-'}"`
  ).join('\n')
  const strengthSummary = strengthRecords.map((r) =>
    `${r.date}: ${r.exercise}${r.weight ? ` ${r.weight}kg` : ''}${r.reps ? ` ${r.reps}회` : ''}${r.sets ? ` ${r.sets}세트` : ''}${r.notes ? `, ${r.notes}` : ''}`
  ).join('\n')
  const competitionSummary = competitions.map((comp) => {
    const results = competitionResults
      .filter((r) => r.competition_id === comp.id)
      .map((r) => `${r.event} ${r.record_time || '-'}${r.rank ? ` ${r.rank}위` : ''}`)
      .join(' / ')
    return `${comp.start_date}~${comp.end_date || comp.start_date}: ${comp.name} (${comp.events?.join(', ') || '종목 미정'})${results ? `, 결과: ${results}` : ''}`
  }).join('\n')

  const prompt = `
너는 엘리트 수영 선수의 월간 데이터 리포트를 작성하는 퍼포먼스 분석가다. ${c.intro}의 ${year}년 ${month}월 데이터를 바탕으로 깊이 있는 결과서를 작성한다.${c.notes}

[이번 달 훈련 기록]
${trainingSummary || '기록 없음'}

[이번 달 PB 갱신]
${pbSummary || '갱신 없음'}

[현재 주요 PB]
${latestPbSummary || '기록 없음'}

[신체 기록]
${bodySummary || '기록 없음'}

[멘탈 일지]
${mentalSummary || '기록 없음'}

[근력 기록]
${strengthSummary || '기록 없음'}

[시합 일정 및 결과]
${competitionSummary || '기록 없음'}

아래 형식으로 한국어 결과서를 작성해.
마크다운 문법(**, ###, -, *)은 쓰지 마.
선수에게 직접 말 거는 문장보다 결과서 문체로 써.
근거 없는 단정은 피하고, 데이터가 부족한 항목은 부족하다고 명시해.

1. 이달의 핵심 요약
훈련량, 컨디션, 기록 변화, 멘탈 흐름을 묶어 4~5문장으로 요약한다.

2. 훈련 수행 평가
훈련 빈도, 총 거리, 운동 강도, 수면, 신체 피로를 종합해 5~7문장으로 분석한다.

3. PB 및 경기력 변화
이번 달 PB 갱신 여부와 현재 주요 PB를 연결해 경기력 변화 가능성을 4~6문장으로 분석한다.

4. 신체 상태와 회복
체중, 체지방, 수면, 컨디션, 신체 피로, 근력 기록을 연결해 4~6문장으로 분석한다.

5. 멘탈 상태
감정, 목표 선명도, 집중 내용, 개선 과제를 바탕으로 4~6문장으로 분석한다.

6. 다음 달 훈련 방향
다음 달에 우선할 훈련 방향 4가지를 구체적으로 제안한다.

7. 종합 결론
이달 데이터가 2028 LA 목표에 어떤 의미인지 3~4문장으로 정리한다.
`.trim()

  return callGemini(prompt, 1400)
}

export async function getCompetitionPrePlan(competition, pbs, profile) {
  const c = ctx(profile)
  const pbSummary = pbs.slice(0, 8).map((p) => `${p.event}: ${p.record_time}`).join('\n')
  const events = competition.events?.join(', ') || '미정'
  const daysUntil = Math.ceil((new Date(competition.start_date) - new Date()) / (1000 * 60 * 60 * 24))
  const daysLabel = daysUntil >= 0 ? `${daysUntil}일 후` : `${Math.abs(daysUntil)}일 전 종료`

  const prompt = `
너는 수영 장거리 전문 코치야. ${c.intro}의 시합 전 2주 훈련 플랜을 짜줘.${c.notes}

[시합 정보]
대회명: ${competition.name}
시합일: ${competition.start_date} (${daysLabel})
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

export async function getCompetitionPostPlan(competition, pbs, profile) {
  const c = ctx(profile)
  const pbSummary = pbs.slice(0, 8).map((p) => `${p.event}: ${p.record_time}`).join('\n')
  const events = competition.events?.join(', ') || '미정'

  const prompt = `
너는 수영 장거리 전문 코치야. ${c.intro}의 시합 후 1주 회복 플랜을 짜줘.${c.notes}

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

export async function getGrowthSimulation(pbs, logs, profile) {
  const c = ctx(profile)
  const pbSummary = pbs.slice(0, 10).map((p) => `${p.event}: ${p.record_time} (${p.achieved_date})`).join('\n')
  const recentAvgDist = logs.length
    ? Math.round(logs.slice(0, 14).reduce((s, l) => s + (l.total_distance_m || 0), 0) / Math.min(logs.length, 14))
    : 0

  const prompt = `
너는 수영 데이터 분석가다. ${c.intro}의 현재 데이터를 바탕으로 2026~2028 성장 시나리오를 작성한다.${c.notes}

[현재 PB 기록]
${pbSummary || '없음'}

[최근 평균 일일 훈련량]
${recentAvgDist}m/일

[참고]
- 2028 LA 올림픽: 2028년 7월 14일 (당시 만 ${c.olympicAge}세)
- 현재 만 ${c.age}세
- 웨이트 트레이닝 미수행 상태 (성장 여지 최대)
- 2025 세계주니어 자유형 1500m 6위 입상

아래 형식만 사용해. 서론은 쓰지 마.
마크다운 문법(**, ###, -, *)은 사용하지 마.
과한 칭찬이나 응원 문구는 쓰지 마.
기록은 가능한 한 수영 기록 형식으로 짧게 쓴다.

자유형 1500m
2026 예측: X:XX.XX (현재 대비 -X.X초)
2027 예측: X:XX.XX
2028 예측: X:XX.XX
근거: 1문장

자유형 800m
2026 예측: X:XX.XX
2027 예측: X:XX.XX
2028 예측: X:XX.XX
근거: 1문장

자유형 400m
2026 예측: X:XX.XX
2027 예측: X:XX.XX
2028 예측: X:XX.XX
근거: 1문장

개인혼영 400m
2026 예측: X:XX.XX
2027 예측: X:XX.XX
2028 예측: X:XX.XX
근거: 1문장

종합 전망
2문장 이내
`.trim()

  return callGemini(prompt, 900)
}

export async function getCompetitionEvaluation(competition, results, pbs, goals, profile) {
  const c = ctx(profile)
  const resultSummary = results.map((r) =>
    `${r.event}: ${r.record_time ?? '기록없음'} / ${r.rank ? r.rank + '위' : '순위없음'}${r.heat ? ` (${r.heat})` : ''}${r.notes ? ` — ${r.notes}` : ''}`
  ).join('\n')
  const pbSummary = pbs.slice(0, 8).map((p) => `${p.event}: ${p.record_time}`).join('\n')
  const goalSummary = Object.entries(goals).map(([ev, g]) => `${ev}: 목표 ${g.target_time}`).join('\n') || '목표 없음'

  const prompt = `
너는 수영 장거리 전문 코치야. ${c.intro}의 시합 결과를 분석해줘.${c.notes}

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

