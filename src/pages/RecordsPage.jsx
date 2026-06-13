import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { calcFinaPoints } from '../lib/fina'
import { Plus, Trophy, ChevronDown, ChevronUp, Target, Pencil } from 'lucide-react'
import { timeToSeconds } from '../lib/fina'

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
const ALL_EVENTS = EVENT_GROUPS.flatMap((g) => g.events)

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
    await supabase.from('personal_bests').insert({ ...form, user_id: user.id })
    setForm(defaultForm)
    setShowForm(false)
    fetchRecords()
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

  // 종목별 최신 PB
  const latestPb = (event) => records.find((r) => r.event === event) || null

  // 종목별 히스토리
  const history = (event) => records.filter((r) => r.event === event)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">PB 기록 관리</h1>
          <p className="text-slate-400 text-sm mt-0.5">종목별 개인 최고 기록</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGoalForm(!showGoalForm)}
            className="flex items-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            <Target size={16} />
            목표 설정
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
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
              <input
                type="text"
                value={goalForm.target_time}
                onChange={(e) => setGoalForm((f) => ({ ...f, target_time: e.target.value }))}
                placeholder="예: 14:52.00"
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
              <input
                type="text"
                value={form.record_time}
                onChange={(e) => setForm((f) => ({ ...f, record_time: e.target.value }))}
                placeholder="예: 15:13.36 또는 24.73"
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

          return (
            <div key={group.label} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
              <button
                onClick={() => setExpandedGroup(isOpen ? null : group.label)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-700/20 transition"
              >
                <div className="flex items-center gap-3">
                  <Trophy size={15} className={hasAny ? 'text-yellow-400' : 'text-slate-600'} />
                  <span className="text-white font-medium text-sm">{group.label}</span>
                  {hasAny && (
                    <span className="text-xs text-slate-500">
                      {groupPbs.filter((x) => x.pb).length}개 기록
                    </span>
                  )}
                </div>
                {isOpen ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
              </button>

              {isOpen && (
                <div className="border-t border-slate-700/30">
                  <table className="w-full text-sm">
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
                                <span className={`text-xs font-medium ${fina >= 900 ? 'text-yellow-400' : fina >= 800 ? 'text-blue-400' : 'text-slate-400'}`}>
                                  {fina}
                                </span>
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

                  {/* 히스토리 */}
                  {group.events.some((ev) => history(ev).length > 1) && (
                    <div className="px-5 py-3 border-t border-slate-700/30">
                      <p className="text-xs text-slate-500 mb-2">기록 히스토리</p>
                      <div className="space-y-1">
                        {group.events.flatMap((ev) =>
                          history(ev).slice(1).map((r) => (
                            <div key={r.id} className="flex gap-4 text-xs text-slate-600">
                              <span>{r.achieved_date}</span>
                              <span>{ev}</span>
                              <span>{r.record_time}</span>
                              <span>{r.notes}</span>
                            </div>
                          ))
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
