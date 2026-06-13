import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { Plus, Trophy } from 'lucide-react'

const EVENTS = ['자유형 400m', '자유형 800m', '자유형 1500m', '개인혼영 400m']
const OLYMPIC = {
  '자유형 400m': '3:43.00',
  '자유형 800m': '7:50.00',
  '자유형 1500m': '14:52.00',
  '개인혼영 400m': '4:12.00',
}
const FINA_PTS = {
  '자유형 400m': { pb: 881 },
  '자유형 1500m': { pb: 798 },
}

const defaultForm = { event: '자유형 1500m', record_time: '', achieved_date: new Date().toISOString().slice(0, 10), notes: '' }

export default function RecordsPage() {
  const user = useAuthStore((s) => s.user)
  const [records, setRecords] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [showForm, setShowForm] = useState(false)

  const fetch = async () => {
    const { data } = await supabase
      .from('personal_bests')
      .select('*')
      .eq('user_id', user.id)
      .order('achieved_date', { ascending: false })
    setRecords(data || [])
  }

  useEffect(() => { fetch() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    await supabase.from('personal_bests').insert({ ...form, user_id: user.id })
    setForm(defaultForm)
    setShowForm(false)
    fetch()
  }

  // Group latest PB per event
  const latestPbs = EVENTS.reduce((acc, ev) => {
    const rec = records.find((r) => r.event === ev)
    acc[ev] = rec || null
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">PB 기록 관리</h1>
          <p className="text-slate-400 text-sm mt-0.5">종목별 개인 최고 기록</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          기록 추가
        </button>
      </div>

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
                {EVENTS.map((ev) => <option key={ev}>{ev}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">기록 (mm:ss.xx)</label>
              <input
                type="text"
                value={form.record_time}
                onChange={(e) => setForm((f) => ({ ...f, record_time: e.target.value }))}
                placeholder="예: 15:13.36"
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
              <label className="block text-sm text-slate-400 mb-1">메모 (선택)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="대회명 등"
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

      {/* PB Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {EVENTS.map((ev) => {
          const pb = latestPbs[ev]
          return (
            <div key={ev} className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={16} className="text-yellow-400" />
                <span className="text-slate-300 text-sm font-medium">{ev}</span>
              </div>
              <p className="text-3xl font-bold text-white mb-1">{pb?.record_time ?? '-'}</p>
              <p className="text-xs text-slate-500">{pb?.achieved_date ?? '기록 없음'}</p>
              <div className="mt-3 pt-3 border-t border-slate-700/30 flex justify-between text-xs">
                <span className="text-slate-500">올림픽 기준</span>
                <span className="text-blue-400">{OLYMPIC[ev]}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* History */}
      {records.length > 0 && (
        <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">기록 히스토리</h2>
          <div className="space-y-2">
            {records.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0 text-sm">
                <span className="text-slate-400">{r.achieved_date}</span>
                <span className="text-slate-300">{r.event}</span>
                <span className="text-white font-semibold">{r.record_time}</span>
                <span className="text-slate-500 text-xs">{r.notes || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
