import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { Activity, BrainCircuit, CalendarDays, ClipboardCheck, Save, Target, User } from 'lucide-react'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts'
import { calcFinaPoints, timeToSeconds } from '../lib/fina'

const EVENT_OPTIONS = [
  '자유형 50m', '자유형 100m', '자유형 200m', '자유형 400m', '자유형 800m', '자유형 1500m',
  '배영 50m', '배영 100m', '배영 200m',
  '평영 50m', '평영 100m', '평영 200m',
  '접영 50m', '접영 100m', '접영 200m',
  '개인혼영 200m', '개인혼영 400m',
]

function calcKoreanAge(birthDateStr) {
  if (!birthDateStr) return null
  return new Date().getFullYear() - new Date(birthDateStr).getFullYear() + 1
}

function calcWesternAge(birthDateStr) {
  if (!birthDateStr) return null
  const today = new Date()
  const birth = new Date(birthDateStr)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function calcAgeAt(birthDateStr, targetDate) {
  if (!birthDateStr) return null
  const target = new Date(targetDate)
  const birth = new Date(birthDateStr)
  let age = target.getFullYear() - birth.getFullYear()
  const m = target.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && target.getDate() < birth.getDate())) age--
  return age
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value || 0)))
}

function average(rows, key) {
  const values = rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value) && value > 0)
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function formatGapSeconds(value) {
  return `${Math.abs(value).toFixed(2)}초`
}

const defaultForm = {
  name: '',
  birth_date: '',
  team: '',
  coach: '',
  main_events: [],
  goal: '',
  notes: '',
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState(defaultForm)
  const [pbs, setPbs] = useState([])
  const [logs, setLogs] = useState([])
  const [bodyRecords, setBodyRecords] = useState([])
  const [mentalLogs, setMentalLogs] = useState([])
  const [strengthRecords, setStrengthRecords] = useState([])
  const [competitions, setCompetitions] = useState([])
  const [competitionResults, setCompetitionResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [profileId, setProfileId] = useState(null)

  useEffect(() => {
    const fetchProfile = async () => {
      const [profileRes, pbsRes, logsRes, bodyRes, mentalRes, strengthRes, competitionsRes, competitionResultsRes] = await Promise.all([
        supabase.from('athlete_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('personal_bests').select('*').eq('user_id', user.id).order('achieved_date', { ascending: true }),
        supabase.from('training_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(30),
        supabase.from('body_records').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(5),
        supabase.from('mental_journals').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(30),
        supabase.from('strength_records').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(30),
        supabase.from('competitions').select('*').eq('user_id', user.id).order('start_date', { ascending: true }),
        supabase.from('competition_results').select('*').eq('user_id', user.id),
      ])
      const data = profileRes.data
      if (data) {
        setProfileId(data.id)
        setForm({
          name: data.name || '',
          birth_date: data.birth_date || '',
          team: data.team || '',
          coach: data.coach || '',
          main_events: data.main_events || [],
          goal: data.goal || '',
          notes: data.notes || '',
        })
      }
      setPbs(pbsRes.data || [])
      setLogs(logsRes.data || [])
      setBodyRecords(bodyRes.data || [])
      setMentalLogs(mentalRes.data || [])
      setStrengthRecords(strengthRes.data || [])
      setCompetitions(competitionsRes.data || [])
      setCompetitionResults(competitionResultsRes.data || [])
      setLoading(false)
    }
    fetchProfile()
  }, [])

  const toggleEvent = (ev) => {
    setForm((f) => ({
      ...f,
      main_events: f.main_events.includes(ev)
        ? f.main_events.filter((e) => e !== ev)
        : [...f.main_events, ev],
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      user_id: user.id,
      ...form,
      updated_at: new Date().toISOString(),
    }
    if (profileId) {
      await supabase.from('athlete_profiles').update(payload).eq('id', profileId)
    } else {
      const { data } = await supabase.from('athlete_profiles').insert(payload).select().single()
      if (data) setProfileId(data.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const westernAge = calcWesternAge(form.birth_date)
  const koreanAge = calcKoreanAge(form.birth_date)
  const olympicAge = calcAgeAt(form.birth_date, '2028-07-14')
  const recentLogs = logs.slice(0, 14)
  const avgCondition = average(recentLogs, 'condition_score')
  const avgFatigue = average(recentLogs, 'forearm_fatigue')
  const avgIntensity = average(recentLogs, 'rpe')
  const avgSleep = average(recentLogs, 'sleep_hours')
  const totalRecentDistance = recentLogs.reduce((s, l) => s + (l.total_distance_m || 0), 0)
  const latestBody = bodyRecords[0]
  const previousBody = bodyRecords[1]
  const weightChange = latestBody?.weight && previousBody?.weight ? latestBody.weight - previousBody.weight : null

  const latestPbMap = {}
  pbs.forEach((pb) => {
    if (!latestPbMap[pb.event] || timeToSeconds(pb.record_time) < timeToSeconds(latestPbMap[pb.event].record_time)) {
      latestPbMap[pb.event] = pb
    }
  })
  const latestPbs = Object.values(latestPbMap)
  const pbsWithFina = latestPbs
    .map((pb) => ({ ...pb, fina: calcFinaPoints(pb.event, pb.record_time) || 0 }))
    .sort((a, b) => b.fina - a.fina)
  const bestPb = pbsWithFina[0] || null
  const finaPoints = pbsWithFina.map((pb) => pb.fina).filter(Boolean)
  const bestFina = finaPoints.length ? Math.max(...finaPoints) : 0
  const pbGroups = pbs.reduce((acc, pb) => {
    if (!acc[pb.event]) acc[pb.event] = []
    acc[pb.event].push(pb)
    return acc
  }, {})
  const pbEventsWithHistory = Object.values(pbGroups).filter((rows) => rows.length >= 2).length
  const improvedEventCount = Object.values(pbGroups).filter((rows) => {
    if (rows.length < 2) return false
    const sorted = [...rows].sort((a, b) => new Date(a.achieved_date) - new Date(b.achieved_date))
    const first = sorted[0]
    const best = sorted.reduce((currentBest, row) =>
      timeToSeconds(row.record_time) < timeToSeconds(currentBest.record_time) ? row : currentBest
    )
    return timeToSeconds(best.record_time) < timeToSeconds(first.record_time)
  }).length
  const mainEventCoverage = form.main_events.length
    ? form.main_events.filter((event) => latestPbMap[event]).length / form.main_events.length
    : 0
  const today = new Date().toISOString().slice(0, 10)
  const upcomingCompetition = competitions.find((competition) => (competition.end_date || competition.start_date) >= today)
  const competitionMap = competitions.reduce((acc, competition) => {
    acc[competition.id] = competition
    return acc
  }, {})
  const resultIssues = competitionResults
    .filter((result) => result.record_time && latestPbMap[result.event])
    .map((result) => {
      const pb = latestPbMap[result.event]
      const gapSec = timeToSeconds(result.record_time) - timeToSeconds(pb.record_time)
      return {
        ...result,
        pb,
        gapSec,
        competition: competitionMap[result.competition_id],
      }
    })
    .filter((result) => result.gapSec > 0.5)
    .sort((a, b) => b.gapSec - a.gapSec)
  const dataCompleteness = [
    latestPbs.length > 0,
    recentLogs.length > 0,
    bodyRecords.length > 0,
    mentalLogs.length > 0,
    strengthRecords.length > 0,
    competitions.length > 0,
  ].filter(Boolean).length

  const radarData = [
    { item: '기록 경쟁력', score: clampScore(bestFina / 9.5), description: bestPb ? `${bestPb.event} ${bestPb.fina}pt` : 'PB 없음' },
    { item: '성장 추적', score: clampScore(pbEventsWithHistory * 18 + improvedEventCount * 12), description: `${pbEventsWithHistory}종목 추이` },
    { item: '훈련 누적', score: clampScore(totalRecentDistance / 900 + recentLogs.length * 3), description: `최근 ${recentLogs.length}회 ${(totalRecentDistance / 1000).toFixed(1)}km` },
    { item: '컨디션', score: clampScore(avgCondition * 10), description: avgCondition ? `${avgCondition.toFixed(1)}/10` : '기록 없음' },
    { item: '회복 안정성', score: clampScore((10 - avgFatigue) * 8 + avgSleep * 3), description: avgFatigue ? `피로 ${avgFatigue.toFixed(1)}/10` : '기록 없음' },
    { item: '종목 완성도', score: clampScore(mainEventCoverage * 100), description: form.main_events.length ? `${Math.round(mainEventCoverage * 100)}%` : '전문종목 없음' },
  ]

  const chartAverage = radarData.reduce((sum, item) => sum + item.score, 0) / radarData.length
  const strongestArea = [...radarData].sort((a, b) => b.score - a.score)[0]
  const weakestArea = [...radarData].sort((a, b) => a.score - b.score)[0]
  const recoveryState = avgFatigue >= 6.5
    ? '신체 피로가 높은 편이라 기록 저하가 보이면 훈련량보다 회복 상태를 먼저 확인해야 합니다.'
    : avgCondition >= 7 && avgFatigue <= 4
      ? '컨디션은 안정적이고 피로도는 낮은 편이라 고품질 훈련을 소화하기 좋은 상태입니다.'
      : avgCondition
        ? '컨디션과 피로는 무난하지만, 강도 높은 훈련 후 회복 반응을 계속 확인할 필요가 있습니다.'
        : '컨디션과 피로 기록이 부족해 현재 몸 상태 판단은 제한적입니다.'
  const performanceState = resultIssues[0]
    ? `${resultIssues[0].event} 시합 기록이 PB보다 +${formatGapSeconds(resultIssues[0].gapSec)} 늦어 레이스 운영, 턴 이후 재가속, 후반 유지력이 보완 포인트입니다.`
    : bestPb
      ? `현재 가장 좋은 기록 축은 ${bestPb.event}이며, ${bestPb.record_time} / FINA ${bestPb.fina}pt로 경쟁력의 기준점이 잡혀 있습니다.`
      : 'PB 기록이 아직 부족해 현재 경기력의 강점 종목을 판단하기 어렵습니다.'
  const growthState = improvedEventCount > 0
    ? `${improvedEventCount}개 종목에서 기록 개선 흐름이 확인되어, 지금은 강점 종목을 중심으로 경기력을 확장하기 좋은 단계입니다.`
    : pbEventsWithHistory > 0
      ? '기록 추이는 쌓이고 있지만 뚜렷한 개선 폭은 아직 제한적입니다. 같은 종목 반복 측정으로 원인을 더 좁혀야 합니다.'
      : '기록 추적 데이터가 적어 성장 속도 판단이 어렵습니다. 주종목 위주로 기준 기록을 반복해서 쌓는 것이 우선입니다.'
  const profileSummary = [
    performanceState,
    growthState,
    recoveryState,
  ]
  const coachCheckpoints = [
    resultIssues[0] && `${resultIssues[0].event} 경기 기록이 PB보다 +${formatGapSeconds(resultIssues[0].gapSec)} 늦습니다. ${resultIssues[0].competition?.name ? `${resultIssues[0].competition.name} 결과 기준으로 ` : ''}초반 100m 진입, 후반 페이스 유지, 턴 이후 재가속 중 어디서 밀렸는지 랩 기록으로 확인하세요.`,
    resultIssues[0] && `${resultIssues[0].event} 보완 훈련: 레이스 페이스 4~6회 반복, 마지막 50m 유지 훈련, 턴 후 15m 가속 구간 체크를 다음 2주 훈련에 넣는 것이 좋습니다.`,
    avgFatigue >= 6.5 && `신체 피로가 ${avgFatigue.toFixed(1)}/10으로 높습니다. 경기 기록이 흔들렸다면 훈련 부족보다 회복 부족 가능성도 함께 확인하세요.`,
    avgCondition > 0 && avgCondition < 6 && `컨디션 평균이 ${avgCondition.toFixed(1)}/10입니다. 고강도 세트 전 수면, 식사, 워밍업 루틴이 일정했는지 점검하세요.`,
    weakestArea && `${weakestArea.item} 점수가 가장 낮습니다. 이 항목을 다음 코칭 미팅의 첫 확인 주제로 잡으세요.`,
    !resultIssues.length && strongestArea && `${strongestArea.item}이 현재 강점입니다. 이 강점이 실제 시합 기록으로 이어지는지 경기 결과와 함께 계속 확인하세요.`,
    upcomingCompetition && `다가오는 시합 ${upcomingCompetition.name} 전에는 목표 페이스, 출전 종목별 레이스 전략, 회복일 배치를 먼저 확정하세요.`,
    mainEventCoverage < 1 && form.main_events.length > 0 && `전문 종목 ${form.main_events.length}개 중 PB가 없는 종목이 있습니다. 주종목 판단을 위해 최소 기준 기록을 먼저 채우세요.`,
    !latestBody && '신체 기록이 없어 체중·체성분 변화와 경기력 저하의 관계를 확인하기 어렵습니다.',
    !strengthRecords.length && '근력 기록이 없어 웨이트 변화와 수영 기록의 관계를 볼 수 없습니다.',
  ].filter(Boolean).slice(0, 5)

  if (loading) return <div className="text-slate-400 text-sm">불러오는 중...</div>

  return (
    <div className="max-w-none">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">선수 정보</h1>
        <p className="text-slate-400 text-sm mt-0.5">AI 분석 및 대시보드에 사용되는 기본 정보</p>
      </div>

      {/* 나이 요약 카드 */}
      {form.birth_date && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 text-center">
            <p className="text-xs text-slate-500 mb-1">만 나이 (현재)</p>
            <p className="text-2xl font-bold text-blue-400">{westernAge}세</p>
            <p className="text-xs text-slate-600 mt-1">국제 기준</p>
          </div>
          <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 text-center">
            <p className="text-xs text-slate-500 mb-1">한국 나이 (현재)</p>
            <p className="text-2xl font-bold text-purple-400">{koreanAge}세</p>
            <p className="text-xs text-slate-600 mt-1">세는 나이</p>
          </div>
          <div className="bg-[#1a1d27] rounded-xl p-4 border border-green-500/20 border text-center bg-green-500/5">
            <p className="text-xs text-slate-500 mb-1">올림픽 출전 나이</p>
            <p className="text-2xl font-bold text-green-400">{olympicAge}세</p>
            <p className="text-xs text-slate-600 mt-1">2028년 7월 14일</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(460px,0.75fr)] gap-6">
      <div>
      <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700/30">
          <User size={15} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-slate-300">기본 정보</h2>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">이름</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="예: 원준"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">생년월일</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm(f => ({ ...f, birth_date: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">소속 팀 / 학교</label>
              <input
                type="text"
                value={form.team}
                onChange={(e) => setForm(f => ({ ...f, team: e.target.value }))}
                placeholder="예: ○○고등학교"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">코치</label>
              <input
                type="text"
                value={form.coach}
                onChange={(e) => setForm(f => ({ ...f, coach: e.target.value }))}
                placeholder="예: 김○○ 코치"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">전문 종목 (복수 선택)</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_OPTIONS.map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => toggleEvent(ev)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                    form.main_events.includes(ev)
                      ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                      : 'bg-transparent border-slate-700 text-slate-500 hover:border-slate-500'
                  }`}
                >
                  {ev}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">목표</label>
            <input
              type="text"
              value={form.goal}
              onChange={(e) => setForm(f => ({ ...f, goal: e.target.value }))}
              placeholder="예: 2028 LA 올림픽 자유형 1500m 출전"
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">메모 (선택)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="예: 웨이트 트레이닝 미수행 중, 성장 여지 최대"
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 font-semibold px-5 py-2.5 rounded-lg transition text-sm ${
              saved
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white'
            }`}
          >
            <Save size={15} />
            {saving ? '저장 중...' : saved ? '저장됨 ✓' : '저장'}
          </button>
        </div>
      </div>

      {/* 이메일 */}
      <div className="mt-4 bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
        <p className="text-xs text-slate-500 mb-1">계정 이메일</p>
        <p className="text-sm text-slate-300">{user.email}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <ClipboardCheck size={15} className="text-purple-400" />
            코치 체크포인트
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {(coachCheckpoints.length ? coachCheckpoints : ['현재 입력된 데이터 기준으로 즉시 확인해야 할 위험 신호는 크지 않습니다.']).map((line, index) => (
              <p key={index} className="text-sm text-slate-300 leading-relaxed bg-[#0f1117] rounded-lg px-3 py-2 border border-slate-800">
                {line}
              </p>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-1 gap-4">
          <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Target size={15} className="text-yellow-400" />
              핵심 종목
            </h2>
            <div className="space-y-2">
              {pbsWithFina.slice(0, 3).length ? pbsWithFina.slice(0, 3).map((pb) => (
                <div key={pb.id} className="flex items-center justify-between gap-3 text-sm bg-[#0f1117] rounded-lg px-3 py-2 border border-slate-800">
                  <span className="text-slate-300 truncate">{pb.event}</span>
                  <span className="text-blue-300 font-semibold shrink-0">{pb.fina}pt</span>
                </div>
              )) : (
                <p className="text-sm text-slate-500">PB 기록이 없습니다.</p>
              )}
            </div>
          </div>
          <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <CalendarDays size={15} className="text-red-400" />
              시합 일정
            </h2>
            <div className="space-y-2 text-sm">
              <div className="bg-[#0f1117] rounded-lg px-3 py-2 border border-slate-800">
                <p className="text-xs text-slate-500">다가오는 시합</p>
                <p className="text-slate-300 mt-0.5">{upcomingCompetition ? upcomingCompetition.name : '등록 없음'}</p>
              </div>
              <div className="bg-[#0f1117] rounded-lg px-3 py-2 border border-slate-800">
                <p className="text-xs text-slate-500">기록 입력 상태</p>
                <p className="text-slate-300 mt-0.5">
                  {dataCompleteness >= 5
                    ? '분석에 필요한 기록이 충분합니다'
                    : dataCompleteness >= 3
                      ? '일부 기록이 더 필요합니다'
                      : '기록을 더 입력해야 분석이 정확해집니다'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
      <div className="space-y-4">
        <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <BrainCircuit size={15} className="text-blue-400" />
                AI 선수 차트
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">PB, 훈련, 회복, 멘탈 기록 기반 자동 점수화</p>
            </div>
            <span className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-1">
              종합 {chartAverage.toFixed(0)}점
            </span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="item" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.28} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {radarData.map((item) => (
              <div key={item.item} className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">{item.item}</p>
                  <p className="text-xs font-bold text-blue-300">{item.score}</p>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Activity size={15} className="text-green-400" />
            선수 상태 요약
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800">
              <p className="text-xs text-slate-500 mb-1">최고 FINA</p>
              <p className="text-xl font-bold text-white">{bestFina ? `${bestFina}pt` : '-'}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">{bestPb?.event || 'PB 없음'}</p>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800">
              <p className="text-xs text-slate-500 mb-1">최근 훈련량</p>
              <p className="text-xl font-bold text-white">{(totalRecentDistance / 1000).toFixed(1)}km</p>
              <p className="text-[11px] text-slate-600 mt-0.5">최근 {recentLogs.length}회</p>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800">
              <p className="text-xs text-slate-500 mb-1">컨디션 / 피로</p>
              <p className="text-xl font-bold text-orange-400">
                {avgCondition ? `${avgCondition.toFixed(1)} / ${avgFatigue.toFixed(1)}` : '-'}
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">10점 기준</p>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800">
              <p className="text-xs text-slate-500 mb-1">신체 변화</p>
              <p className="text-xl font-bold text-green-400">
                {latestBody?.weight ? `${latestBody.weight}kg` : '-'}
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {weightChange !== null ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)}kg` : '비교 기록 없음'}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {profileSummary.map((line, index) => (
              <p key={index} className="text-sm text-slate-300 leading-relaxed bg-[#0f1117] rounded-lg px-3 py-2 border border-slate-800">
                {line}
              </p>
            ))}
          </div>
        </div>

      </div>
      </div>
    </div>
  )
}
