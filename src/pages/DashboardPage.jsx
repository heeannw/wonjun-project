import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { calcFinaPoints, timeToSeconds } from '../lib/fina'
import { getTrendAnalysis, getGrowthSimulation } from '../lib/gemini'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { Flame, Moon, Activity, Target, Trophy, BrainCircuit, RefreshCw, TrendingUp } from 'lucide-react'

const OLYMPIC_TARGETS = {
  '자유형 400m':  { target: '3:43.00', targetSec: 223.0 },
  '자유형 800m':  { target: '7:50.00', targetSec: 470.0 },
  '자유형 1500m': { target: '14:52.00', targetSec: 892.0 },
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/10',
    green: 'text-green-400 bg-green-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
  }
  return (
    <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon size={16} className={colors[color].split(' ')[0]} />
        </div>
        <span className="text-slate-400 text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const [logs, setLogs] = useState([])
  const [pbs, setPbs] = useState([])
  const [goalsMap, setGoalsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [trendAnalysis, setTrendAnalysis] = useState('')
  const [analyzingTrend, setAnalyzingTrend] = useState(false)
  const [simulation, setSimulation] = useState('')
  const [simulating, setSimulating] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const [logsRes, pbsRes, goalsRes] = await Promise.all([
        supabase.from('training_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(30),
        supabase.from('personal_bests').select('*').eq('user_id', user.id).order('achieved_date', { ascending: true }),
        supabase.from('goals').select('*').eq('user_id', user.id),
      ])
      setLogs(logsRes.data || [])
      setPbs(pbsRes.data || [])
      const gm = {}
      goalsRes.data?.forEach((g) => { gm[g.event] = g })
      setGoalsMap(gm)
      setLoading(false)
    }
    fetchData()
  }, [user.id])

  const recentLogs = logs.slice(0, 7)
  const avgRpe = recentLogs.length
    ? (recentLogs.reduce((s, l) => s + (l.rpe || 0), 0) / recentLogs.length).toFixed(1)
    : '-'
  const avgSleep = recentLogs.length
    ? (recentLogs.reduce((s, l) => s + (l.sleep_hours || 0), 0) / recentLogs.length).toFixed(1)
    : '-'
  const totalDistThisWeek = recentLogs.reduce((s, l) => s + (l.total_distance_m || 0), 0)

  const trainingChartData = [...logs].reverse().slice(-14).map((l) => ({
    date: l.date?.slice(5),
    거리: l.total_distance_m,
    RPE: l.rpe,
    컨디션: l.condition_score,
  }))

  // 종목별 최신 PB
  const latestPbs = {}
  pbs.forEach((p) => { latestPbs[p.event] = p })

  // FINA 포인트 데이터
  const finaData = Object.keys(OLYMPIC_TARGETS).map((event) => {
    const pb = latestPbs[event]
    const points = pb ? calcFinaPoints(event, pb.record_time) : null
    return { event: event.replace('자유형 ', '자유형\n'), points, record: pb?.record_time }
  }).filter((d) => d.points)

  // PB 변화 그래프 (1500m 기준)
  const pbChartData = pbs
    .filter((p) => p.event === '자유형 1500m')
    .sort((a, b) => new Date(a.achieved_date) - new Date(b.achieved_date))
    .map((p) => ({
      date: p.achieved_date?.slice(2),
      기록초: Math.round(timeToSeconds(p.record_time) * 100) / 100,
      기록: p.record_time,
      fina: calcFinaPoints('자유형 1500m', p.record_time) ?? '-',
    }))

  // Gap: 개인 목표 설정한 종목만 표시
  const gapData = Object.entries(goalsMap).map(([event, goal]) => {
    const pb = latestPbs[event]
    const targetSec = timeToSeconds(goal.target_time)
    const pbSec = pb ? timeToSeconds(pb.record_time) : null
    const gapSec = pbSec ? pbSec - targetSec : null
    const progress = pbSec ? Math.max(0, Math.min(98, (1 - gapSec / pbSec * 8) * 100)) : 0
    return { event, target: goal.target_time, pb: pb?.record_time, pbSec, gapSec, progress, isGoal: true, deadline: goal.deadline }
  })

  const daysLeft = Math.ceil((new Date('2028-07-14') - new Date()) / (1000 * 60 * 60 * 24))
  const weeksLeft = Math.floor(daysLeft / 7)
  const monthsLeftRounded = Math.floor(daysLeft / 30)

  // 주간 훈련 볼륨 계산
  const weeklyVolumeMap = {}
  logs.forEach((log) => {
    const d = new Date(log.date)
    const dayOfWeek = d.getDay()
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    const monday = new Date(d)
    monday.setDate(diff)
    const key = monday.toISOString().slice(0, 10)
    if (!weeklyVolumeMap[key]) weeklyVolumeMap[key] = { week: monday.toISOString().slice(5, 10), volume: 0, sessions: 0 }
    weeklyVolumeMap[key].volume += log.total_distance_m || 0
    weeklyVolumeMap[key].sessions += 1
  })
  const weeklyVolumeData = Object.values(weeklyVolumeMap)
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-10)

  const runSimulation = async () => {
    setSimulating(true)
    try {
      const result = await getGrowthSimulation(pbs, logs)
      setSimulation(result)
    } catch (e) {
      setSimulation(`시뮬레이션 오류: ${e.message}`)
    } finally {
      setSimulating(false)
    }
  }

  const runTrendAnalysis = async () => {
    if (logs.length === 0) return
    setAnalyzingTrend(true)
    try {
      const result = await getTrendAnalysis(logs, Object.values(latestPbs))
      setTrendAnalysis(result)
    } catch {
      setTrendAnalysis('분석 중 오류가 발생했습니다.')
    } finally {
      setAnalyzingTrend(false)
    }
  }

  // 주요 FINA 포인트 (1500m)
  const main1500Pts = latestPbs['자유형 1500m']
    ? calcFinaPoints('자유형 1500m', latestPbs['자유형 1500m'].record_time)
    : null

  // 올림픽 기준 달성 시나리오
  const OLYMPIC_STANDARDS = {
    '자유형 400m':  { target: '3:43.00', targetSec: 223.0 },
    '자유형 800m':  { target: '7:50.00', targetSec: 470.0 },
    '자유형 1500m': { target: '14:52.00', targetSec: 892.0 },
    '개인혼영 400m': { target: '4:12.00', targetSec: 252.0 },
  }
  const monthsLeft = daysLeft / 30
  const scenarios = Object.entries(OLYMPIC_STANDARDS).map(([event, { target, targetSec }]) => {
    const pb = latestPbs[event]
    if (!pb) return null
    const pbSec = timeToSeconds(pb.record_time)
    const gapSec = pbSec - targetSec
    const monthlyNeeded = gapSec > 0 ? (gapSec / monthsLeft).toFixed(2) : 0
    const achieved = gapSec <= 0
    return { event, target, pbSec, targetSec, gapSec, monthlyNeeded, achieved }
  }).filter(Boolean)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">대시보드</h1>
        <p className="text-slate-400 text-sm mt-0.5 mb-4">
          2028 LA 올림픽까지 <span className="text-blue-400 font-semibold">{daysLeft}일</span> 남았습니다
        </p>
        {/* 올림픽 카운트다운 배너 */}
        <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏊</span>
            <div>
              <p className="text-white font-bold text-sm">2028 LA 올림픽</p>
              <p className="text-slate-400 text-xs">2028년 7월 14일</p>
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-blue-400 font-bold text-2xl leading-none">{daysLeft}</p>
              <p className="text-slate-500 text-xs mt-1">일</p>
            </div>
            <div className="w-px bg-slate-700" />
            <div>
              <p className="text-purple-400 font-bold text-2xl leading-none">{weeksLeft}</p>
              <p className="text-slate-500 text-xs mt-1">주</p>
            </div>
            <div className="w-px bg-slate-700" />
            <div>
              <p className="text-green-400 font-bold text-2xl leading-none">{monthsLeftRounded}</p>
              <p className="text-slate-500 text-xs mt-1">개월</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">원준 나이</p>
            <p className="text-white font-bold">20세 <span className="text-slate-500 font-normal text-xs">at 올림픽</span></p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Activity} label="이번 주 거리" value={`${totalDistThisWeek.toLocaleString()}m`} sub="최근 7일" color="blue" />
        <StatCard icon={Flame} label="평균 RPE" value={avgRpe} sub="최근 7일" color="orange" />
        <StatCard icon={Moon} label="평균 수면" value={`${avgSleep}h`} sub="최근 7일" color="purple" />
        <StatCard icon={Target} label="D-Day" value={`D-${daysLeft}`} sub="2028 LA 올림픽" color="green" />
      </div>

      {/* FINA Points + PB 변화 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* FINA 포인트 */}
        <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={15} className="text-yellow-400" />
            <h2 className="text-sm font-semibold text-slate-300">FINA 포인트</h2>
          </div>
          {finaData.length === 0 ? (
            <p className="text-slate-500 text-sm">PB 기록 페이지에서 기록을 입력하면 표시됩니다.</p>
          ) : (
            <div className="space-y-3">
              {finaData.map(({ event, points, record }) => (
                <div key={event}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">{event}</span>
                    <span className="text-white font-semibold">{points}pts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-700/40 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${points >= 900 ? 'bg-yellow-400' : points >= 800 ? 'bg-blue-400' : 'bg-slate-500'}`}
                        style={{ width: `${Math.min(100, points / 10)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{record}</span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-600 mt-2">올림픽 A기준 ≈ 900pts 이상</p>
            </div>
          )}
        </div>

        {/* PB 변화 그래프 */}
        <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">자유형 1500m PB 변화</h2>
          {pbChartData.length < 2 ? (
            <p className="text-slate-500 text-sm">PB 기록을 2개 이상 입력하면 그래프가 표시됩니다.</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={pbChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={(v) => {
                    const m = Math.floor(v / 60)
                    const s = (v % 60).toFixed(0).padStart(2, '0')
                    return `${m}:${s}`
                  }}
                  reversed
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1d27', border: '1px solid #334155', borderRadius: 8 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={{ backgroundColor: '#1a1d27', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
                        <p style={{ color: '#94a3b8', marginBottom: 2 }}>{d.date}</p>
                        <p style={{ color: '#3b82f6', fontWeight: 600 }}>{d.기록}</p>
                        <p style={{ color: '#facc15' }}>FINA {d.fina}pt</p>
                      </div>
                    )
                  }}
                />
                <Line type="monotone" dataKey="기록초" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 훈련 추이 */}
      {trainingChartData.length > 0 && (
        <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">훈련 추이 (최근 2주)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trainingChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1d27', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line type="monotone" dataKey="거리" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="RPE" stroke="#f97316" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="컨디션" stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 주간 훈련 볼륨 */}
      {weeklyVolumeData.length > 0 && (
        <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-green-400" />
            <h2 className="text-sm font-semibold text-slate-300">주간 훈련 볼륨</h2>
            <span className="text-xs text-slate-500">최근 10주</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyVolumeData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
              <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1d27', border: '1px solid #334155', borderRadius: 8 }}
                formatter={(value, name) => [`${value.toLocaleString()}m`, '총 거리']}
                labelFormatter={(label) => `${label} 주차`}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="volume" fill="#22c55e" radius={[4, 4, 0, 0]}>
                {weeklyVolumeData.map((entry, index) => {
                  const isMax = entry.volume === Math.max(...weeklyVolumeData.map(d => d.volume))
                  return <Cell key={index} fill={isMax ? '#facc15' : '#22c55e'} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-slate-600 mt-1">노란색: 최고 볼륨 주차</p>
        </div>
      )}

      {/* Gap */}
      <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">목표 기록 Gap</h2>
        <div className="space-y-3">
          {gapData.map(({ event, target, pb, gapSec, progress, isGoal, deadline }) => (
            <div key={event}>
              <div className="flex justify-between text-sm mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-slate-300">{event}</span>
                  {isGoal
                    ? <span className="text-xs text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">내 목표</span>
                    : <span className="text-xs text-slate-600 bg-slate-700/30 px-1.5 py-0.5 rounded">올림픽</span>
                  }
                </div>
                <span className="text-slate-400">
                  {pb ? `${pb} → ${target}` : `목표 ${target}`}
                  {gapSec != null && gapSec > 0 && (
                    <span className="text-orange-400 ml-2">-{gapSec.toFixed(2)}초</span>
                  )}
                  {gapSec != null && gapSec <= 0 && (
                    <span className="text-green-400 ml-2">달성!</span>
                  )}
                </span>
              </div>
              <div className="w-full bg-slate-700/40 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${isGoal ? 'bg-purple-500' : 'bg-blue-500'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {deadline && (
                <p className="text-xs text-slate-600 mt-0.5 text-right">목표일: {deadline}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 종합 추세 AI 분석 */}
      <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BrainCircuit size={15} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-slate-300">종합 추세 AI 분석</h2>
          </div>
          <button
            onClick={runTrendAnalysis}
            disabled={analyzingTrend || logs.length === 0}
            className="flex items-center gap-1.5 text-xs bg-purple-600/20 hover:bg-purple-600/30 disabled:opacity-40 text-purple-300 px-3 py-1.5 rounded-lg border border-purple-500/30 transition"
          >
            <RefreshCw size={12} className={analyzingTrend ? 'animate-spin' : ''} />
            {analyzingTrend ? '분석 중...' : '분석 실행'}
          </button>
        </div>
        {trendAnalysis ? (
          <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{trendAnalysis}</div>
        ) : (
          <p className="text-slate-600 text-sm">
            {logs.length === 0
              ? '훈련 일지를 먼저 입력하면 분석할 수 있습니다.'
              : '분석 실행 버튼을 눌러 최근 훈련 추세를 분석하세요.'}
          </p>
        )}
      </div>

      {/* 올림픽 달성 시나리오 */}
      {scenarios.length > 0 && (
        <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏅</span>
              <h2 className="text-sm font-semibold text-slate-300">올림픽 기준 달성 시나리오</h2>
              <span className="text-xs text-slate-500">2028 LA</span>
            </div>
            <span className="text-xs text-slate-500 bg-slate-700/40 px-2.5 py-1 rounded-full">
              {Math.round(monthsLeft)}개월 남음
            </span>
          </div>
          <div className="space-y-5">
            {scenarios.map(({ event, target, pbSec, targetSec, gapSec, monthlyNeeded, achieved }) => {
              // 진척도: 최악 기준(pbSec * 1.15)에서 목표까지 얼마나 왔는지
              const worstSec = targetSec * 1.15
              const progress = Math.min(100, Math.max(0, ((worstSec - pbSec) / (worstSec - targetSec)) * 100))
              return (
                <div key={event}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium">{event}</span>
                      {achieved && <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full font-semibold">달성!</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-400">현재 <span className="text-white font-semibold">{latestPbs[event]?.record_time}</span></span>
                      <span className="text-slate-600">→</span>
                      <span className="text-slate-400">목표 <span className="text-blue-400 font-semibold">{target}</span></span>
                    </div>
                  </div>
                  <div className="relative h-5 bg-slate-700/40 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${achieved ? 'bg-green-500' : progress > 70 ? 'bg-blue-500' : progress > 40 ? 'bg-orange-500' : 'bg-red-500/70'}`}
                      style={{ width: `${progress}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-end pr-2">
                      <span className="text-xs font-bold text-white drop-shadow">{progress.toFixed(0)}%</span>
                    </div>
                  </div>
                  {!achieved && (
                    <div className="flex justify-between mt-1 text-xs text-slate-600">
                      <span>남은 gap: {gapSec.toFixed(2)}초</span>
                      <span className="text-orange-400/80">월 {monthlyNeeded}초 단축 필요</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AI 성장 시뮬레이션 */}
      <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BrainCircuit size={15} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-slate-300">AI 성장 시뮬레이션</h2>
            <span className="text-xs text-slate-500">2026~2028 예측</span>
          </div>
          <button
            onClick={runSimulation}
            disabled={simulating}
            className="flex items-center gap-1.5 text-xs bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
          >
            {simulating ? <RefreshCw size={11} className="animate-spin" /> : <BrainCircuit size={11} />}
            {simulating ? '분석 중...' : simulation ? '재시뮬레이션' : '시뮬레이션 실행'}
          </button>
        </div>
        {simulation ? (
          <div className="bg-[#0f1117] rounded-lg p-4 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
            {simulation}
          </div>
        ) : (
          <p className="text-slate-600 text-sm">현재 PB 기록과 훈련 데이터를 기반으로 2028 올림픽까지의 성장 예측을 생성합니다.</p>
        )}
      </div>

      {/* Recent logs */}
      <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">최근 훈련 일지</h2>
        {loading ? (
          <p className="text-slate-500 text-sm">불러오는 중...</p>
        ) : logs.length === 0 ? (
          <p className="text-slate-500 text-sm">아직 기록된 훈련이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <div>
                  <p className="text-sm text-white">{log.date}</p>
                  <p className="text-xs text-slate-500">{log.main_event || '자유형'}</p>
                </div>
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>{log.total_distance_m?.toLocaleString()}m</span>
                  <span>RPE {log.rpe}</span>
                  <span>수면 {log.sleep_hours}h</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
