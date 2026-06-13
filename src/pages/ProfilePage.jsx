import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { Save, User, ChevronDown } from 'lucide-react'
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [profileId, setProfileId] = useState(null)

  useEffect(() => {
    const fetchProfile = async () => {
      const [profileRes, pbsRes, logsRes, bodyRes] = await Promise.all([
        supabase.from('athlete_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('personal_bests').select('*').eq('user_id', user.id).order('achieved_date', { ascending: true }),
        supabase.from('training_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(30),
        supabase.from('body_records').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(5),
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
  const avgCondition = recentLogs.length ? recentLogs.reduce((s, l) => s + (l.condition_score || 0), 0) / recentLogs.length : 0
  const avgFatigue = recentLogs.length ? recentLogs.reduce((s, l) => s + (l.forearm_fatigue || 0), 0) / recentLogs.length : 0
  const avgIntensity = recentLogs.length ? recentLogs.reduce((s, l) => s + (l.rpe || 0), 0) / recentLogs.length : 0
  const totalRecentDistance = recentLogs.reduce((s, l) => s + (l.total_distance_m || 0), 0)
  const latestBody = bodyRecords[0]

  const latestPbMap = {}
  pbs.forEach((pb) => {
    if (!latestPbMap[pb.event] || timeToSeconds(pb.record_time) < timeToSeconds(latestPbMap[pb.event].record_time)) {
      latestPbMap[pb.event] = pb
    }
  })
  const finaPoints = Object.values(latestPbMap).map((pb) => calcFinaPoints(pb.event, pb.record_time)).filter(Boolean)
  const bestFina = finaPoints.length ? Math.max(...finaPoints) : 0
  const pbEventsWithHistory = Object.keys(
    pbs.reduce((acc, pb) => {
      if (!acc[pb.event]) acc[pb.event] = []
      acc[pb.event].push(pb)
      return acc
    }, {})
  ).filter((event) => pbs.filter((pb) => pb.event === event).length >= 2).length
  const mainEventCoverage = form.main_events.length
    ? form.main_events.filter((event) => latestPbMap[event]).length / form.main_events.length
    : 0

  const radarData = [
    { item: '기록 경쟁력', score: Math.min(100, Math.round(bestFina / 9.5)) },
    { item: '성장 추적', score: Math.min(100, pbEventsWithHistory * 25) },
    { item: '훈련 누적', score: Math.min(100, Math.round(totalRecentDistance / 1200)) },
    { item: '컨디션', score: Math.round(avgCondition * 10) || 0 },
    { item: '회복 안정성', score: Math.max(0, Math.round((10 - avgFatigue) * 10)) || 0 },
    { item: '종목 완성도', score: Math.round(mainEventCoverage * 100) || 0 },
  ]

  const profileSummary = [
    bestFina >= 850
      ? '주요 PB 기준 국제 경쟁력 지표가 높게 형성되어 있습니다.'
      : bestFina >= 750
        ? 'PB 기반 경기력은 상위권으로 올라갈 기반이 있습니다.'
        : 'PB 데이터가 더 쌓이면 경기력 판단 정확도가 높아집니다.',
    pbEventsWithHistory > 0
      ? `${pbEventsWithHistory}개 종목에서 기록 추이를 추적할 수 있습니다.`
      : '기록 추이를 보려면 같은 종목 PB를 2회 이상 쌓는 것이 좋습니다.',
    recentLogs.length
      ? `최근 ${recentLogs.length}회 훈련 평균 컨디션은 ${avgCondition.toFixed(1)}/10, 신체 피로는 ${avgFatigue.toFixed(1)}/10입니다.`
      : '최근 훈련 데이터가 부족해 컨디션과 피로 추세는 아직 제한적입니다.',
  ]

  if (loading) return <div className="text-slate-400 text-sm">불러오는 중...</div>

  return (
    <div className="max-w-7xl">
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
            <p className="text-xs text-slate-500 mb-1">올림픽 당시 나이</p>
            <p className="text-2xl font-bold text-green-400">{olympicAge}세</p>
            <p className="text-xs text-slate-600 mt-1">2028년 7월 14일</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
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
              <h2 className="text-sm font-semibold text-slate-300">선수 퍼포먼스 차트</h2>
              <p className="text-xs text-slate-500 mt-0.5">PB, 훈련, 컨디션 기반 자동 분석</p>
            </div>
            <span className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-1">
              {bestFina ? `최고 ${bestFina}pt` : 'PB 없음'}
            </span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="item" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.28} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">선수 상태 요약</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800">
              <p className="text-xs text-slate-500 mb-1">주요 PB 수</p>
              <p className="text-xl font-bold text-white">{Object.keys(latestPbMap).length}</p>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800">
              <p className="text-xs text-slate-500 mb-1">최근 훈련량</p>
              <p className="text-xl font-bold text-white">{(totalRecentDistance / 1000).toFixed(1)}km</p>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800">
              <p className="text-xs text-slate-500 mb-1">평균 운동 강도</p>
              <p className="text-xl font-bold text-orange-400">{avgIntensity ? avgIntensity.toFixed(1) : '-'}</p>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800">
              <p className="text-xs text-slate-500 mb-1">현재 체중</p>
              <p className="text-xl font-bold text-green-400">{latestBody?.weight ? `${latestBody.weight}kg` : '-'}</p>
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
          <h2 className="text-sm font-semibold text-slate-300 mb-3">기대 포인트</h2>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>• 전문 종목 PB와 훈련량이 함께 쌓이면 성장 예측 정확도가 높아집니다.</li>
            <li>• 신체 기록과 컨디션을 같이 보면 피로 누적 시점을 더 빨리 찾을 수 있습니다.</li>
            <li>• 같은 종목 기록을 반복 저장하면 기록 추이와 갱신 가능성을 더 선명하게 볼 수 있습니다.</li>
          </ul>
        </div>
      </div>
      </div>
    </div>
  )
}
