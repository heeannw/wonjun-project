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

const EMOTION_LABELS = {
  '😤': '집중',
  '💪': '자신감',
  '😊': '평온',
  '😐': '보통',
  '😔': '피로',
  '😟': '불안',
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [profileId, setProfileId] = useState(null)

  useEffect(() => {
    const fetchProfile = async () => {
      const [profileRes, pbsRes, logsRes, bodyRes, mentalRes, strengthRes, competitionsRes] = await Promise.all([
        supabase.from('athlete_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('personal_bests').select('*').eq('user_id', user.id).order('achieved_date', { ascending: true }),
        supabase.from('training_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(30),
        supabase.from('body_records').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(5),
        supabase.from('mental_journals').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(30),
        supabase.from('strength_records').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(30),
        supabase.from('competitions').select('*').eq('user_id', user.id).order('start_date', { ascending: true }),
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
  const emotionCounts = mentalLogs.reduce((acc, log) => {
    acc[log.emotion] = (acc[log.emotion] || 0) + 1
    return acc
  }, {})
  const topEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]
  const today = new Date().toISOString().slice(0, 10)
  const upcomingCompetition = competitions.find((competition) => (competition.end_date || competition.start_date) >= today)
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
  const profileSummary = [
    bestPb
      ? `최고 경쟁력은 ${bestPb.event} ${bestPb.record_time} 기록이며 FINA ${bestPb.fina}pt입니다.`
      : 'PB 기록이 아직 없어 경기력 기준점이 비어 있습니다.',
    recentLogs.length
      ? `최근 ${recentLogs.length}회 훈련은 총 ${(totalRecentDistance / 1000).toFixed(1)}km, 평균 운동 강도 ${avgIntensity.toFixed(1)}, 컨디션 ${avgCondition.toFixed(1)}/10입니다.`
      : '최근 훈련 기록이 없어 훈련 부하와 회복 상태를 판단하기 어렵습니다.',
    mentalLogs.length
      ? `최근 멘탈 기록은 ${EMOTION_LABELS[topEmotion?.[0]] || topEmotion?.[0]} 흐름이 가장 많고, 일지 ${mentalLogs.length}건이 누적되어 있습니다.`
      : '멘탈 일지가 없어 심리 상태 흐름은 아직 차트에 반영되지 않았습니다.',
  ]
  const coachCheckpoints = [
    weakestArea && `${weakestArea.item} 점수가 가장 낮습니다. 다음 코칭 미팅에서 이 항목을 먼저 확인하세요.`,
    strongestArea && `${strongestArea.item}이 현재 가장 강한 축입니다. 강점을 훈련 계획에 연결할 수 있습니다.`,
    upcomingCompetition && `다가오는 시합: ${upcomingCompetition.name} (${upcomingCompetition.start_date}${upcomingCompetition.end_date ? `~${upcomingCompetition.end_date}` : ''})`,
    avgFatigue >= 6.5 && '신체 피로가 높은 편입니다. 회복 훈련 또는 수면 관리 확인이 필요합니다.',
    mainEventCoverage < 1 && form.main_events.length > 0 && `전문 종목 ${form.main_events.length}개 중 PB가 없는 종목이 있습니다.`,
    !latestBody && '신체 기록이 없어 체중·체성분 변화 분석이 빠져 있습니다.',
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

        <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <ClipboardCheck size={15} className="text-purple-400" />
            코치 체크포인트
          </h2>
          <div className="space-y-2">
            {(coachCheckpoints.length ? coachCheckpoints : ['현재 입력된 데이터 기준으로 즉시 확인해야 할 위험 신호는 크지 않습니다.']).map((line, index) => (
              <p key={index} className="text-sm text-slate-300 leading-relaxed bg-[#0f1117] rounded-lg px-3 py-2 border border-slate-800">
                {line}
              </p>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
              일정 감도
            </h2>
            <div className="space-y-2 text-sm">
              <div className="bg-[#0f1117] rounded-lg px-3 py-2 border border-slate-800">
                <p className="text-xs text-slate-500">다가오는 시합</p>
                <p className="text-slate-300 mt-0.5">{upcomingCompetition ? upcomingCompetition.name : '등록 없음'}</p>
              </div>
              <div className="bg-[#0f1117] rounded-lg px-3 py-2 border border-slate-800">
                <p className="text-xs text-slate-500">분석 데이터</p>
                <p className="text-slate-300 mt-0.5">{dataCompleteness}/6 영역 입력됨</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
