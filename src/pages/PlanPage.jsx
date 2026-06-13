import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { ChevronLeft, ChevronRight, Plus, X, Check } from 'lucide-react'
import RoutinePage from './RoutinePage'

const DAYS = ['월', '화', '수', '목', '금', '토', '일']

function getWeekDates(baseDate) {
  const d = new Date(baseDate)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return date.toISOString().slice(0, 10)
  })
}

function toDateLabel(dateStr) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function toMonthLabel(dateStr) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

export default function PlanPage() {
  const user = useAuthStore((s) => s.user)
  const [baseDate, setBaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [plans, setPlans] = useState({})
  const [logs, setLogs] = useState({})
  const [routines, setRoutines] = useState([])
  const [editingDate, setEditingDate] = useState(null)
  const [editForm, setEditForm] = useState({ routine_id: '', custom_note: '' })
  const [activeTab, setActiveTab] = useState('calendar')

  const weekDates = getWeekDates(baseDate)

  const fetchData = async () => {
    const [plansRes, logsRes, routinesRes] = await Promise.all([
      supabase.from('training_plans').select('*, routines(name, total_distance_m)').eq('user_id', user.id).in('date', weekDates),
      supabase.from('training_logs').select('date, total_distance_m, rpe, condition_score').eq('user_id', user.id).in('date', weekDates),
      supabase.from('routines').select('id, name, total_distance_m').eq('user_id', user.id).order('day_of_week'),
    ])
    const planMap = {}
    plansRes.data?.forEach((p) => { planMap[p.date] = p })
    const logMap = {}
    logsRes.data?.forEach((l) => { logMap[l.date] = l })
    setPlans(planMap)
    setLogs(logMap)
    setRoutines(routinesRes.data || [])
  }

  useEffect(() => { fetchData() }, [baseDate])

  const prevWeek = () => {
    const d = new Date(baseDate)
    d.setDate(d.getDate() - 7)
    setBaseDate(d.toISOString().slice(0, 10))
  }
  const nextWeek = () => {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + 7)
    setBaseDate(d.toISOString().slice(0, 10))
  }
  const goToday = () => setBaseDate(new Date().toISOString().slice(0, 10))

  const openEdit = (date) => {
    const existing = plans[date]
    setEditForm({
      routine_id: existing?.routine_id || '',
      custom_note: existing?.custom_note || '',
    })
    setEditingDate(date)
  }

  const savePlan = async () => {
    const existing = plans[editingDate]
    const payload = {
      user_id: user.id,
      date: editingDate,
      routine_id: editForm.routine_id || null,
      custom_note: editForm.custom_note || null,
    }
    if (existing) {
      await supabase.from('training_plans').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('training_plans').insert(payload)
    }
    setEditingDate(null)
    fetchData()
  }

  const deletePlan = async (date) => {
    const existing = plans[date]
    if (!existing) return
    await supabase.from('training_plans').delete().eq('id', existing.id)
    setEditingDate(null)
    fetchData()
  }

  const today = new Date().toISOString().slice(0, 10)
  const weekLabel = `${toDateLabel(weekDates[0])} ~ ${toDateLabel(weekDates[6])}`

  const totalPlanned = weekDates.reduce((s, d) => {
    const r = plans[d]?.routines
    return s + (r?.total_distance_m || 0)
  }, 0)
  const totalDone = weekDates.reduce((s, d) => s + (logs[d]?.total_distance_m || 0), 0)

  if (activeTab === 'templates') {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">운동 계획</h1>
            <p className="text-slate-400 text-sm mt-0.5">주간 계획과 루틴 템플릿을 함께 관리하세요</p>
          </div>
          <div className="bg-[#1a1d27] border border-slate-700/50 rounded-lg p-1 flex">
            <button
              onClick={() => setActiveTab('calendar')}
              className="px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-white transition"
            >
              주간 계획
            </button>
            <button className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white transition">
              루틴 템플릿
            </button>
          </div>
        </div>
        <RoutinePage embedded />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">운동 계획</h1>
          <p className="text-slate-400 text-sm mt-0.5">주간 계획과 루틴 템플릿을 함께 관리하세요</p>
        </div>
        <div className="bg-[#1a1d27] border border-slate-700/50 rounded-lg p-1 flex">
          <button className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white transition">
            주간 계획
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className="px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-white transition"
          >
            루틴 템플릿
          </button>
        </div>
      </div>

      {/* 주간 캘린더 헤더 */}
      <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 mb-1">WEEKLY PLAN</p>
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-bold text-white">{toMonthLabel(weekDates[0])}</h2>
              <span className="text-sm text-slate-400">{weekLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevWeek} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
              <ChevronLeft size={16} />
            </button>
            <button onClick={goToday} className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-sm transition hover:bg-blue-600/30">
              오늘
            </button>
            <button onClick={nextWeek} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-slate-500">계획 </span>
              <span className="text-blue-400 font-semibold">{totalPlanned.toLocaleString()}m</span>
            </div>
            <div>
              <span className="text-slate-500">실행 </span>
              <span className="text-green-400 font-semibold">{totalDone.toLocaleString()}m</span>
            </div>
            <div>
              <span className="text-slate-500">달성률 </span>
              <span className="text-white font-semibold">
                {totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0}%
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500">날짜 카드를 눌러 계획을 추가하세요</p>
        </div>
      </div>

      {/* 7일 캘린더 */}
      <div className="grid grid-cols-7 gap-3 mb-6">
        {weekDates.map((date, i) => {
          const plan = plans[date]
          const log = logs[date]
          const isToday = date === today
          const isPast = date < today
          const hasPlan = !!plan
          const hasDone = !!log

          return (
            <div
              key={date}
              className={`rounded-xl border p-3 min-h-40 flex flex-col transition cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/60 ${
                isToday
                  ? 'border-blue-500/70 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]'
                  : 'border-slate-700/50 bg-[#1a1d27]'
              }`}
              onClick={() => openEdit(date)}
            >
              {/* 날짜 헤더 */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className={`text-xs font-medium ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>{DAYS[i]}</p>
                  <p className={`text-xl font-bold ${isToday ? 'text-blue-300' : 'text-white'}`}>{toDateLabel(date)}</p>
                </div>
                {isToday && <span className="text-[10px] text-blue-300 bg-blue-500/15 border border-blue-500/20 rounded-full px-2 py-0.5">오늘</span>}
                {hasDone && (
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check size={11} className="text-green-400" />
                  </div>
                )}
              </div>

              {/* 계획 */}
              {hasPlan ? (
                <div className="flex-1">
                  {plan.routines ? (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-2 py-1.5 mb-1.5">
                      <p className="text-blue-300 text-xs font-medium truncate">{plan.routines.name}</p>
                      <p className="text-blue-400/70 text-xs">{plan.routines.total_distance_m?.toLocaleString()}m</p>
                    </div>
                  ) : null}
                  {plan.custom_note && (
                    <p className="text-slate-400 text-xs leading-relaxed">{plan.custom_note}</p>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <Plus size={16} className="text-slate-700" />
                </div>
              )}

              {/* 실제 훈련 */}
              {hasDone && (
                <div className="mt-2 pt-2 border-t border-slate-700/30">
                  <p className="text-green-400 text-xs font-medium">{log.total_distance_m?.toLocaleString()}m 완료</p>
                  <p className="text-slate-500 text-xs">운동 강도 {log.rpe} · 컨디션 {log.condition_score}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 편집 모달 */}
      {editingDate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a1d27] rounded-2xl p-6 w-full max-w-md border border-slate-700/50 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-slate-400 text-xs">{DAYS[weekDates.indexOf(editingDate)]}요일</p>
                <h2 className="text-white font-bold">{editingDate}</h2>
              </div>
              <button onClick={() => setEditingDate(null)} className="text-slate-500 hover:text-white transition">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">루틴 선택 (선택)</label>
                <select
                  value={editForm.routine_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, routine_id: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">루틴 없음</option>
                  {routines.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.total_distance_m?.toLocaleString()}m)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">메모 (선택)</label>
                <textarea
                  value={editForm.custom_note}
                  onChange={(e) => setEditForm((f) => ({ ...f, custom_note: e.target.value }))}
                  rows={3}
                  placeholder="오늘의 훈련 목표나 계획을 적어두세요"
                  className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={savePlan}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg transition"
              >
                저장
              </button>
              {plans[editingDate] && (
                <button
                  onClick={() => deletePlan(editingDate)}
                  className="px-4 bg-slate-700 hover:bg-red-500/20 hover:text-red-400 text-slate-300 text-sm py-2 rounded-lg transition"
                >
                  삭제
                </button>
              )}
              <button
                onClick={() => setEditingDate(null)}
                className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2 rounded-lg transition"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
