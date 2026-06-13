import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { ChevronLeft, ChevronRight, Plus, X, Check } from 'lucide-react'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

function toISODate(date) {
  return date.toISOString().slice(0, 10)
}

function getMonthGrid(baseDate) {
  const base = new Date(baseDate)
  const year = base.getFullYear()
  const month = base.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date: toISODate(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
    }
  })
}

function toMonthTitle(dateStr) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

function toModalDateLabel(dateStr) {
  const d = new Date(dateStr)
  const day = DAYS[d.getDay()]
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${day}요일`
}

function getPlanTitle(plan) {
  return plan?.custom_note?.split('\n').find(Boolean)?.trim() || '일정'
}

export default function PlanPage() {
  const user = useAuthStore((s) => s.user)
  const [baseDate, setBaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [plans, setPlans] = useState({})
  const [logs, setLogs] = useState({})
  const [competitions, setCompetitions] = useState({})
  const [editingDate, setEditingDate] = useState(null)
  const [editForm, setEditForm] = useState({ custom_note: '' })

  const monthCells = getMonthGrid(baseDate)
  const rangeStart = monthCells[0].date
  const rangeEnd = monthCells[monthCells.length - 1].date
  const today = new Date().toISOString().slice(0, 10)

  const fetchData = async () => {
    const [plansRes, logsRes, competitionsRes] = await Promise.all([
      supabase
        .from('training_plans')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', rangeStart)
        .lte('date', rangeEnd),
      supabase
        .from('training_logs')
        .select('date, total_distance_m, rpe, condition_score, main_event')
        .eq('user_id', user.id)
        .gte('date', rangeStart)
        .lte('date', rangeEnd),
      supabase
        .from('competitions')
        .select('id, name, start_date, end_date, events, location')
        .eq('user_id', user.id)
        .lte('start_date', rangeEnd)
        .gte('start_date', rangeStart),
    ])

    const planMap = {}
    plansRes.data?.forEach((plan) => { planMap[plan.date] = plan })
    const logMap = {}
    logsRes.data?.forEach((log) => { logMap[log.date] = log })
    const competitionMap = {}
    competitionsRes.data?.forEach((competition) => {
      const key = competition.start_date
      if (!competitionMap[key]) competitionMap[key] = []
      competitionMap[key].push(competition)
    })
    setPlans(planMap)
    setLogs(logMap)
    setCompetitions(competitionMap)
  }

  useEffect(() => { fetchData() }, [baseDate])

  const prevMonth = () => {
    const d = new Date(baseDate)
    d.setMonth(d.getMonth() - 1)
    setBaseDate(toISODate(d))
  }

  const nextMonth = () => {
    const d = new Date(baseDate)
    d.setMonth(d.getMonth() + 1)
    setBaseDate(toISODate(d))
  }

  const goToday = () => setBaseDate(today)

  const openEdit = (date) => {
    setEditForm({ custom_note: plans[date]?.custom_note || '' })
    setEditingDate(date)
  }

  const savePlan = async () => {
    const existing = plans[editingDate]
    const payload = {
      user_id: user.id,
      date: editingDate,
      routine_id: null,
      custom_note: editForm.custom_note.trim() || null,
    }

    if (!payload.custom_note && existing) {
      await supabase.from('training_plans').delete().eq('id', existing.id)
    } else if (existing) {
      await supabase.from('training_plans').update(payload).eq('id', existing.id)
    } else if (payload.custom_note) {
      await supabase.from('training_plans').insert(payload)
    }

    setEditingDate(null)
    fetchData()
  }

  const deletePlan = async () => {
    const existing = plans[editingDate]
    if (!existing) return
    await supabase.from('training_plans').delete().eq('id', existing.id)
    setEditingDate(null)
    fetchData()
  }

  const currentMonthDates = monthCells.filter((cell) => cell.isCurrentMonth).map((cell) => cell.date)
  const trainingDays = currentMonthDates.filter((date) => logs[date]).length
  const scheduleDays = currentMonthDates.filter((date) => plans[date]).length
  const competitionDays = currentMonthDates.filter((date) => competitions[date]?.length).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">월간 일정</h1>
          <p className="text-slate-400 text-sm mt-0.5">훈련한 날, 쉬는 날, 시합 일정을 한 달 단위로 확인하세요</p>
        </div>
      </div>

      <div className="bg-[#1a1d27] border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
          <div className="flex items-baseline gap-4">
            <h2 className="text-2xl font-bold text-white">{toMonthTitle(baseDate)}</h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-500">훈련 <span className="text-green-400 font-semibold">{trainingDays}일</span></span>
              <span className="text-slate-500">일정 <span className="text-blue-400 font-semibold">{scheduleDays}일</span></span>
              <span className="text-slate-500">시합 <span className="text-red-400 font-semibold">{competitionDays}일</span></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
              <ChevronLeft size={16} />
            </button>
            <button onClick={goToday} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition">
              오늘
            </button>
            <button onClick={nextMonth} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-700/40">
          {DAYS.map((day) => (
            <div key={day} className="px-3 py-2 text-center text-xs font-medium text-slate-500 border-r border-slate-700/30 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {monthCells.map(({ date, day, isCurrentMonth }) => {
            const plan = plans[date]
            const log = logs[date]
            const dayCompetitions = competitions[date] || []
            const isToday = date === today

            return (
              <button
                key={date}
                type="button"
                onClick={() => openEdit(date)}
                className={`min-h-32 border-r border-b border-slate-700/30 last:border-r-0 p-2 text-left transition hover:bg-slate-800/70 ${
                  isCurrentMonth ? 'bg-[#1a1d27]' : 'bg-[#141821]/70'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm ${isCurrentMonth ? 'text-slate-300' : 'text-slate-600'} ${isToday ? 'bg-blue-600 text-white rounded-full px-2 py-0.5 font-semibold' : ''}`}>
                    {day}
                  </span>
                  {log && (
                    <span className="w-5 h-5 rounded-full bg-green-500/20 inline-flex items-center justify-center">
                      <Check size={11} className="text-green-400" />
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  {dayCompetitions.map((competition) => (
                    <div key={competition.id} className="rounded-md bg-red-500/10 border border-red-500/25 px-2 py-1 shadow-sm">
                      <p className="text-xs font-medium text-red-200 truncate">🚩 {competition.name}</p>
                    </div>
                  ))}
                  {plan?.custom_note && (
                    <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-1 shadow-sm">
                      <p className="text-xs font-medium text-blue-200 truncate">⭐ {getPlanTitle(plan)}</p>
                    </div>
                  )}
                  {log && (
                    <div className="rounded-md bg-green-500/10 border border-green-500/20 px-2 py-1">
                      <p className="text-xs font-medium text-green-300 truncate">완료 {log.total_distance_m?.toLocaleString()}m</p>
                      <p className="text-[11px] text-slate-500 truncate">{log.main_event || '훈련'} · 강도 {log.rpe}</p>
                    </div>
                  )}
                  {!plan && !log && dayCompetitions.length === 0 && isCurrentMonth && (
                    <div className="h-16 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                      <Plus size={15} className="text-slate-600" />
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {editingDate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a1d27] rounded-2xl p-6 w-full max-w-md border border-slate-700/50 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-slate-400 text-xs">일정</p>
                <h2 className="text-white font-bold">{toModalDateLabel(editingDate)}</h2>
              </div>
              <button onClick={() => setEditingDate(null)} className="text-slate-500 hover:text-white transition">
                <X size={20} />
              </button>
            </div>

            {logs[editingDate] && (
              <div className="mb-4 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
                <p className="text-xs font-semibold text-green-300 mb-1">실제 훈련 완료</p>
                <p className="text-sm text-slate-300">
                  {logs[editingDate].total_distance_m?.toLocaleString()}m · {logs[editingDate].main_event || '훈련'} · 운동 강도 {logs[editingDate].rpe}
                </p>
              </div>
            )}

            {competitions[editingDate]?.length > 0 && (
              <div className="mb-4 space-y-2">
                {competitions[editingDate].map((competition) => (
                  <div key={competition.id} className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                    <p className="text-xs font-semibold text-red-300 mb-1">시합 일정</p>
                    <p className="text-sm text-slate-300">{competition.name}</p>
                    {competition.events?.length > 0 && (
                      <p className="text-xs text-slate-500 mt-1">{competition.events.join(', ')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="block text-sm text-slate-400 mb-1.5">일정 메모</label>
              <textarea
                value={editForm.custom_note}
                onChange={(e) => setEditForm({ custom_note: e.target.value })}
                rows={5}
                placeholder={'예: 스트레칭\n가벼운 회복 / 병원 / 개인 일정'}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
              <p className="mt-2 text-xs text-slate-600">첫 줄이 캘린더 카드 제목으로 표시됩니다.</p>
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
                  onClick={deletePlan}
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
