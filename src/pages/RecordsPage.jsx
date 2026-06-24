import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { calcFinaPoints, timeToSeconds } from '../lib/fina'
import { Plus, Trophy, ChevronDown, ChevronUp, Target, Pencil, TrendingDown } from 'lucide-react'
import TimeInput from '../components/TimeInput'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const EVENT_GROUPS = [
  {
    label: '자유형',
    events: ['자유형 50m', '자유형 100m', '자유형 200m', '자유형 400m', '자유형 800m', '자유형 1500m'],
  },
  {
    label: '배영',
    events: ['배영 50m', '배영 100m', '배영 200m'],
  },
  {
    label: '평영',
    events: ['평영 50m', '평영 100m', '평영 200m'],
  },
  {
    label: '접영',
    events: ['접영 50m', '접영 100m', '접영 200m'],
  },
  {
    label: '개인혼영',
    events: ['개인혼영 200m', '개인혼영 400m'],
  },
]
const OLYMPIC = {
  '자유형 400m': '3:43.00',
  '자유형 800m': '7:50.00',
  '자유형 1500m': '14:52.00',
  '개인혼영 400m': '4:12.00',
}

const defaultForm = {
  event: '자유형 1500m',
  record_time: '',
  achieved_date: new Date().toISOString().slice(0, 10),
  notes: '',
}

const defaultGoalForm = { event: '자유형 1500m', target_time: '', deadline: '', notes: '' }

export default function RecordsPage() {
  const user = useAuthStore((s) => s.user)
  const [records, setRecords] = useState([])
  const [goals, setGoals] = useState({})
  const [form, setForm] = useState(defaultForm)
  const [goalForm, setGoalForm] = useState(defaultGoalForm)
  const [showForm, setShowForm] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState('자유형')
  const [showHistory, setShowHistory] = useState({})
  const [celebrate, setCelebrate] = useState(null) // { event, oldTime, newTime }

  const fetchRecords = async () => {
    const { data } = await supabase
      .from('personal_bests')
      .select('*')
      .eq('user_id', user.id)
      .order('achieved_date', { ascending: false })
    setRecords(data || [])
  }

  const fetchGoals = async () => {
    const { data } = await supabase.from('goals').select('*').eq('user_id', user.id)
    const map = {}
    data?.forEach((g) => { map[g.event] = g })
    setGoals(map)
  }

  useEffect(() => { fetchRecords(); fetchGoals() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const currentPb = latestPb(form.event)
    await supabase.from('personal_bests').insert({ ...form, user_id: user.id })
    setForm(defaultForm)
    setShowForm(false)
    await fetchRecords()
    if (!currentPb || timeToSeconds(form.record_time) < timeToSeconds(currentPb.record_time)) {
      setCelebrate({ event: form.event, oldTime: currentPb?.record_time ?? null, newTime: form.record_time })
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('이 기록을 삭제할까요?')) return
    await supabase.from('personal_bests').delete().eq('id', id)
    setRecords((r) => r.filter((x) => x.id !== id))
  }

  const handleGoalSubmit = async (e) => {
    e.preventDefault()
    const existing = goals[goalForm.event]
    const payload = {
      user_id: user.id,
      event: goalForm.event,
      target_time: goalForm.target_time,
      deadline: goalForm.deadline || null,
      notes: goalForm.notes || null,
    }
    if (existing) {
      await supabase.from('goals').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('goals').insert(payload)
    }
    setGoalForm(defaultGoalForm)
    setShowGoalForm(false)
    fetchGoals()
  }

  const openGoalEdit = (event) => {
    const existing = goals[event]
    setGoalForm({
      event,
      target_time: existing?.target_time || '',
      deadline: existing?.deadline || '',
      notes: existing?.notes || '',
    })
    setShowGoalForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 종목별 실제 PB (가장 빠른 기록)
  const latestPb = (event) => {
    const eventRecords = records.filter((r) => r.event === event)
    if (!eventRecords.length) return null
    return eventRecords.reduce((best, r) =>
      timeToSeconds(r.record_time) < timeToSeconds(best.record_time) ? r : best
    )
  }

  // 종목별 히스토리 (날짜 오름차순)
  const history = (event) =>
    records.filter((r) => r.event === event)
      .sort((a, b) => new Date(a.achieved_date) - new Date(b.achieved_date))

  // 영법별 최고 FINA 포인트
  const bestFinaForGroup = (group) =>
    group.events.reduce((best, ev) => {
      const pb = latestPb(ev)
      const fina = pb ? calcFinaPoints(ev, pb.record_time) : null
      if (!fina) return best
      if (!best || fina > best.fina) return { event: ev, fina }
      return best
    }, null)

  return (
    <div>
      {/* PB 축하 모달 */}
      {celebrate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setCelebrate(null)}>
          <div className="bg-[#1a1d27] border border-yellow-500/40 rounded-2xl p-8 text-center max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl mb-4">🏆</div>
            <h2 className="text-xl font-bold text-yellow-400 mb-1">신기록 달성!</h2>
            <p className="text-slate-300 text-sm mb-4">{celebrate.event}</p>
            <div className="bg-[#0f1117] rounded-xl p-4 mb-4">
              {celebrate.oldTime && (
                <p className="text-slate-500 text-sm line-through mb-1">{celebrate.oldTime}</p>
              )}
              <p className="text-2xl font-bold text-white">{celebrate.newTime}</p>
              {celebrate.oldTime && (
                <p className="text-green-400 text-sm mt-1 font-semibold">
                  ▼ {(timeToSeconds(celebrate.oldTime) - timeToSeconds(celebrate.newTime)).toFixed(2)}초 단축
                </p>
              )}
            </div>
            <p className="text-slate-400 text-xs mb-5">2028 LA 올림픽을 향해 계속 나아가자!</p>
            <button
              onClick={() => setCelebrate(null)}
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-6 py-2 rounded-lg transition text-sm"
            >
              확인
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">PB 기록 관리</h1>
          <p className="text-slate-400 text-sm mt-0.5">종목별 개인 최고 기록</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            onClick={() => setShowGoalForm(!showGoalForm)}
            className="flex items-center justify-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-sm font-semibold px-3 py-2 rounded-lg transition"
          >
            <Target size={16} />
            목표 설정
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-3 py-2 rounded-lg transition"
          >
            <Plus size={16} />
            기록 추가
          </button>
        </div>
      </div>

      {/* 목표 설정 폼 */}
      {showGoalForm && (
        <form onSubmit={handleGoalSubmit} className="bg-[#1a1d27] rounded-xl p-5 border border-purple-500/30 mb-6">
          <h2 className="text-sm font-semibold text-purple-300 mb-4 flex items-center gap-2">
            <Target size={14} /> 목표 기록 설정
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">종목</label>
              <select
                value={goalForm.event}
                onChange={(e) => setGoalForm((f) => ({ ...f, event: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              >
                {EVENT_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.events.map((ev) => <option key={ev}>{ev}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">목표 기록</label>
              <TimeInput
                value={goalForm.target_time}
                onChange={(v) => setGoalForm((f) => ({ ...f, target_time: v }))}
                placeholder="숫자만 입력 예: 145200"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">달성 목표일 (선택)</label>
              <input
                type="date"
                value={goalForm.deadline}
                onChange={(e) => setGoalForm((f) => ({ ...f, deadline: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">메모 (선택)</label>
              <input
                type="text"
                value={goalForm.notes}
                onChange={(e) => setGoalForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="예: 올림픽 A기준"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">저장</button>
            <button type="button" onClick={() => setShowGoalForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-5 py-2 rounded-lg transition">취소</button>
          </div>
        </form>
      )}

      {/* 입력 폼 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">종목</label>
              <select
                value={form.event}
                onChange={(e) => setForm((f) => ({ ...f, event: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {EVENT_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.events.map((ev) => <option key={ev}>{ev}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">기록 (m:ss.xx)</label>
              <TimeInput
                value={form.record_time}
                onChange={(v) => setForm((f) => ({ ...f, record_time: v }))}
                placeholder="숫자만 입력 예: 151336"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">달성일</label>
              <input
                type="date"
                value={form.achieved_date}
                onChange={(e) => setForm((f) => ({ ...f, achieved_date: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">대회명 (선택)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="예: 25년 세계주니어"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">저장</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-5 py-2 rounded-lg transition">취소</button>
          </div>
        </form>
      )}

      {/* 그룹별 PB 테이블 */}
      <div className="space-y-3">
        {EVENT_GROUPS.map((group) => {
          const isOpen = expandedGroup === group.label
          const groupPbs = group.events.map((ev) => ({ ev, pb: latestPb(ev) }))
          const hasAny = groupPbs.some((x) => x.pb)
          const groupBestFina = bestFinaForGroup(group)

          return (
            <div key={group.label} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
              <button
                onClick={() => setExpandedGroup(isOpen ? null : group.label)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-700/20 transition"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <Trophy size={15} className={hasAny ? 'text-yellow-400' : 'text-slate-600'} />
                  <span className="text-white font-medium text-sm">{group.label}</span>
                  {hasAny && (
                    <span className="text-xs text-slate-500">
                      {groupPbs.filter((x) => x.pb).length}개 기록
                    </span>
                  )}
                  {groupBestFina && (
                    <span className="max-w-full truncate text-xs font-semibold text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full">
                      최고 FINA {groupBestFina.fina} · {groupBestFina.event.replace(group.label + ' ', '')}
                    </span>
                  )}
                </div>
                {isOpen ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
              </button>

              {isOpen && (
                <div className="border-t border-slate-700/30">
                  <div className="divide-y divide-slate-700/30 md:hidden">
                    {groupPbs.map(({ ev, pb }) => {
                      const fina = pb ? calcFinaPoints(ev, pb.record_time) : null
                      const isGroupBestFina = fina && groupBestFina?.event === ev
                      const goal = goals[ev]
                      const gapSec = pb && goal
                        ? (timeToSeconds(pb.record_time) - timeToSeconds(goal.target_time)).toFixed(2)
                        : null
                      return (
                        <div key={ev} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">{ev}</p>
                              <p className="mt-1 text-xl font-bold text-white">{pb?.record_time ?? '-'}</p>
                            </div>
                            {fina ? (
                              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                                isGroupBestFina
                                  ? 'border border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                                  : fina >= 800
                                    ? 'bg-blue-500/10 text-blue-400'
                                    : 'bg-slate-700/40 text-slate-400'
                              }`}>
                                FINA {fina}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                            <div>
                              <p className="text-slate-600">달성일</p>
                              <p className="mt-0.5 text-slate-400">{pb?.achieved_date ?? '-'}</p>
                            </div>
                            <div>
                              <p className="text-slate-600">대회</p>
                              <p className="mt-0.5 break-words text-slate-400">{pb?.notes ?? '-'}</p>
                            </div>
                            <div>
                              <p className="text-slate-600">목표</p>
                              <button
                                type="button"
                                onClick={() => openGoalEdit(ev)}
                                className="mt-0.5 text-left text-purple-400"
                              >
                                {goal?.target_time || '+ 목표 설정'}
                              </button>
                            </div>
                            <div>
                              <p className="text-slate-600">목표까지</p>
                              <p className={`mt-0.5 font-medium ${gapSec !== null && parseFloat(gapSec) <= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                {gapSec === null ? '-' : parseFloat(gapSec) <= 0 ? '달성' : `${gapSec}초`}
                              </p>
                            </div>
                          </div>
                          {pb && (
                            <button
                              type="button"
                              onClick={() => handleDelete(pb.id)}
                              className="mt-3 text-xs text-red-500/70"
                            >
                              기록 삭제
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <table className="hidden w-full text-sm md:table">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-700/30">
                        <th className="text-left px-5 py-2">종목</th>
                        <th className="text-left px-3 py-2">PB</th>
                        <th className="text-left px-3 py-2">달성일</th>
                        <th className="text-left px-3 py-2">대회</th>
                        <th className="text-left px-3 py-2">FINA</th>
                        <th className="text-left px-3 py-2">목표</th>
                        <th className="text-left px-3 py-2">Gap</th>
                        <th className="text-left px-3 py-2">올림픽</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupPbs.map(({ ev, pb }) => {
                        const fina = pb ? calcFinaPoints(ev, pb.record_time) : null
                        const isGroupBestFina = fina && groupBestFina?.event === ev
                        const goal = goals[ev]
                        const gapSec = pb && goal
                          ? (timeToSeconds(pb.record_time) - timeToSeconds(goal.target_time)).toFixed(2)
                          : null
                        return (
                          <tr key={ev} className="border-b border-slate-700/20 last:border-0 hover:bg-slate-700/10">
                            <td className="px-5 py-2.5 text-slate-300">{ev.replace(group.label + ' ', '')}</td>
                            <td className="px-3 py-2.5">
                              <span className={pb ? 'text-white font-semibold' : 'text-slate-600'}>
                                {pb?.record_time ?? '-'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 text-xs">{pb?.achieved_date ?? '-'}</td>
                            <td className="px-3 py-2.5 text-slate-500 text-xs">{pb?.notes ?? '-'}</td>
                            <td className="px-3 py-2.5">
                              {fina ? (
                                isGroupBestFina ? (
                                  <span className="text-xs font-bold text-yellow-300 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/30">
                                    {fina} 영법 최고
                                  </span>
                                ) : (
                                  <span className={`text-xs font-medium ${fina >= 900 ? 'text-yellow-400' : fina >= 800 ? 'text-blue-400' : 'text-slate-400'}`}>
                                    {fina}
                                  </span>
                                )
                              ) : <span className="text-slate-600 text-xs">-</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              {goal ? (
                                <button
                                  onClick={() => openGoalEdit(ev)}
                                  className="flex items-center gap-1 text-purple-400 text-xs hover:text-purple-300 transition"
                                >
                                  {goal.target_time}
                                  <Pencil size={10} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => openGoalEdit(ev)}
                                  className="text-slate-600 text-xs hover:text-purple-400 transition"
                                >
                                  + 목표
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {gapSec !== null && (
                                <span className={`text-xs font-medium ${parseFloat(gapSec) <= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                  {parseFloat(gapSec) <= 0 ? '달성!' : `-${gapSec}s`}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-blue-400 text-xs">{OLYMPIC[ev] ?? '-'}</td>
                            <td className="px-3 py-2.5">
                              {pb && (
                                <button
                                  onClick={() => handleDelete(pb.id)}
                                  className="text-xs text-red-500/60 hover:text-red-400 transition"
                                >
                                  삭제
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* 성장 그래프 + 히스토리 */}
                  {group.events.some((ev) => history(ev).length > 1) && (
                    <div className="px-5 py-4 border-t border-slate-700/30">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingDown size={13} className="text-green-400" />
                        <p className="text-xs text-slate-400 font-medium">기록 성장 그래프</p>
                      </div>
                      <div className="flex flex-col gap-4">
                        {group.events.filter((ev) => history(ev).length > 1).map((ev) => {
                          const hist = history(ev)
                          const pbSec = Math.min(...hist.map(r => timeToSeconds(r.record_time)))
                          const chartData = hist.map((r) => {
                            const sec = Math.round(timeToSeconds(r.record_time) * 100) / 100
                            return {
                              date: r.achieved_date.slice(2),
                              초: sec,
                              기록: r.record_time,
                              fina: calcFinaPoints(ev, r.record_time) ?? '-',
                              isPb: sec === Math.round(pbSec * 100) / 100,
                            }
                          })
                          const improvementSec = timeToSeconds(hist[0].record_time) - timeToSeconds(hist[hist.length - 1].record_time)
                          const impMin = Math.floor(improvementSec / 60)
                          const impSec = (improvementSec % 60).toFixed(2)
                          const improvementLabel = impMin > 0 ? `${impMin}분 ${impSec}초` : `${impSec}초`
                          const CustomDot = (props) => {
                            const { cx, cy, payload } = props
                            if (payload.isPb) return <circle cx={cx} cy={cy} r={6} fill="#facc15" stroke="#1a1d27" strokeWidth={2} />
                            return <circle cx={cx} cy={cy} r={3} fill="#22c55e" />
                          }
                          return (
                            <div key={ev} className="record-chart-card bg-[#0f1117] rounded-lg p-3 w-full">
                              <div className="flex justify-between items-center mb-2">
                                <p className="text-xs text-slate-300 font-medium">{ev}</p>
                                <span className="text-xs text-green-400 font-semibold">▼{improvementLabel}</span>
                              </div>
                              <ResponsiveContainer width="100%" height={120}>
                                <LineChart data={chartData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} />
                                  <YAxis
                                    domain={['auto', 'auto']}
                                    tick={{ fill: '#64748b', fontSize: 9 }}
                                    reversed
                                    tickFormatter={(v) => {
                                      const m = Math.floor(v / 60)
                                      const s = (v % 60).toFixed(0).padStart(2, '0')
                                      return m > 0 ? `${m}:${s}` : `${v}s`
                                    }}
                                  />
                                  <Tooltip
                                    content={({ active, payload }) => {
                                      if (!active || !payload?.length) return null
                                      const d = payload[0].payload
                                      return (
                                        <div style={{ backgroundColor: '#1a1d27', border: `1px solid ${d.isPb ? '#facc15' : '#334155'}`, borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                                          <p style={{ color: '#94a3b8' }}>{d.date}</p>
                                          <p style={{ color: d.isPb ? '#facc15' : '#22c55e', fontWeight: 600 }}>{d.기록}{d.isPb ? ' ★ PB' : ''}</p>
                                          <p style={{ color: '#60a5fa' }}>FINA {d.fina}pt</p>
                                        </div>
                                      )
                                    }}
                                  />
                                  <Line type="monotone" dataKey="초" stroke="#22c55e" strokeWidth={2} dot={<CustomDot />} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )
                        })}
                      </div>
                      {/* 텍스트 히스토리 (토글) */}
                      <div className="mt-3">
                        <button
                          onClick={() => setShowHistory((h) => ({ ...h, [group.label]: !h[group.label] }))}
                          className="text-xs text-slate-500 hover:text-slate-300 transition flex items-center gap-1"
                        >
                          {showHistory[group.label] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          전체 기록 {showHistory[group.label] ? '숨기기' : '보기'}
                        </button>
                        {showHistory[group.label] && (
                          <div className="mt-2 space-y-0.5">
                            {group.events.flatMap((ev) =>
                              history(ev).map((r) => {
                                const pb = latestPb(ev)
                                const isBest = pb?.id === r.id
                                return (
                                  <div key={r.id} className={`flex gap-4 text-xs py-0.5 ${isBest ? 'text-white' : 'text-slate-600'}`}>
                                    <span className="w-24 shrink-0">{r.achieved_date}</span>
                                    <span className="w-20 shrink-0">{ev}</span>
                                    <span className={isBest ? 'font-bold text-yellow-400 w-16 shrink-0' : 'w-16 shrink-0'}>{r.record_time}</span>
                                    <span className="text-slate-500">{r.notes}</span>
                                    {isBest && <span className="text-yellow-400 ml-1">← PB</span>}
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
