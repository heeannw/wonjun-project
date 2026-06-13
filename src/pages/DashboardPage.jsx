import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { calcFinaPoints, timeToSeconds } from '../lib/fina'
import { getTrendAnalysis } from '../lib/gemini'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { Flame, Moon, Activity, Target, Trophy, BrainCircuit, RefreshCw } from 'lucide-react'

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
    .map((p) => ({
      date: p.achieved_date?.slice(2),
      기록초: Math.round(timeToSeconds(p.record_time)),
      기록: p.record_time,
    }))

  // Gap: 목표 기록이 있으면 목표 기준, 없으면 올림픽 기준
  const gapData = Object.entries(OLYMPIC_TARGETS).map(([event, { target: olympicTarget, targetSec: olympicTargetSec }]) => {
    const pb = latestPbs[event]
    const goal = goalsMap[event]
    const target = goal?.target_time ?? olympicTarget
    const targetSec = goal ? timeToSeconds(goal.target_time) : olympicTargetSec
    const pbSec = pb ? timeToSeconds(pb.record_time) : null
    const gapSec = pbSec ? pbSec - targetSec : null
    const progress = pbSec ? Math.max(0, Math.min(98, (1 - gapSec / pbSec * 8) * 100)) : 0
    const isGoal = !!goal
    return { event, target, pb: pb?.record_time, pbSec, gapSec, progress, isGoal, deadline: goal?.deadline }
  })

  const daysLeft = Math.ceil((new Date('2028-07-14') - new Date()) / (1000 * 60 * 60 * 24))

  const runTrendAnalysis = async () => {
    if (logs.length === 0) return
    setAnalyzingTrend(true)
    try {
      const result = await getTrendAnalysis(logs, pbs)
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">대시보드</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          2028 LA 올림픽까지 <span className="text-blue-400 font-semibold">{daysLeft}일</span> 남았습니다
        </p>
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
                  formatter={(_, __, props) => [props.payload.기록, '기록']}
                  labelStyle={{ color: '#94a3b8' }}
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
