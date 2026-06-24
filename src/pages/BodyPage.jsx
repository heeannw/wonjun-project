import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const defaultForm = {
  date: new Date().toISOString().slice(0, 10),
  weight: '',
  body_fat: '',
  notes: '',
}

export default function BodyPage() {
  const user = useAuthStore((s) => s.user)
  const [records, setRecords] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const fetchRecords = async () => {
    const { data } = await supabase
      .from('body_records')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: true })
    setRecords(data || [])
  }

  useEffect(() => { fetchRecords() }, [])

  const resetForm = () => {
    setForm(defaultForm)
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (record) => {
    setForm({
      date: record.date || defaultForm.date,
      weight: record.weight ?? '',
      body_fat: record.body_fat ?? '',
      notes: record.notes || '',
    })
    setEditingId(record.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      user_id: user.id,
      date: form.date,
      weight: parseFloat(form.weight),
      body_fat: form.body_fat ? parseFloat(form.body_fat) : null,
      notes: form.notes || null,
    }
    if (editingId) {
      await supabase.from('body_records').update(payload).eq('id', editingId)
    } else {
      await supabase.from('body_records').insert(payload)
    }
    resetForm()
    fetchRecords()
  }

  const handleDelete = async (id) => {
    if (!confirm('삭제할까요?')) return
    await supabase.from('body_records').delete().eq('id', id)
    setRecords((r) => r.filter((x) => x.id !== id))
  }

  const chartData = records.map((r) => ({
    date: r.date.slice(2),
    체중: r.weight,
    체지방: r.body_fat ?? undefined,
  }))

  const latest = records[records.length - 1]
  const first = records[0]
  const weightChange = latest && first && latest.id !== first.id
    ? (latest.weight - first.weight).toFixed(1)
    : null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">신체 기록</h1>
          <p className="text-slate-400 text-sm mt-0.5">체중 및 체지방 변화 추적</p>
        </div>
        <button
          onClick={() => {
            if (showForm) resetForm()
            else setShowForm(true)
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          기록 추가
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">{editingId ? '신체 기록 수정' : '신체 기록 입력'}</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">날짜</label>
              <input type="date" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">체중 (kg)</label>
              <input type="number" step="0.1" value={form.weight}
                onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                placeholder="예: 68.5"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">체지방률 % (선택)</label>
              <input type="number" step="0.1" value={form.body_fat}
                onChange={(e) => setForm((f) => ({ ...f, body_fat: e.target.value }))}
                placeholder="예: 12.3"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">메모 (선택)</label>
              <input type="text" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="예: 대회 전날"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">{editingId ? '수정 완료' : '저장'}</button>
            <button type="button" onClick={resetForm} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-5 py-2 rounded-lg transition">취소</button>
          </div>
        </form>
      )}

      {records.length === 0 ? (
        <div className="bg-[#1a1d27] rounded-xl p-8 border border-slate-700/50 text-center text-slate-500 text-sm">
          아직 기록이 없습니다. 첫 번째 신체 기록을 추가해보세요.
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 text-center">
              <p className="text-xs text-slate-500 mb-1">현재 체중</p>
              <p className="text-2xl font-bold text-white">{latest?.weight}<span className="text-sm text-slate-500 ml-1">kg</span></p>
            </div>
            <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 text-center">
              <p className="text-xs text-slate-500 mb-1">체지방률</p>
              <p className="text-2xl font-bold text-white">
                {latest?.body_fat ? <>{latest.body_fat}<span className="text-sm text-slate-500 ml-1">%</span></> : <span className="text-slate-600">-</span>}
              </p>
            </div>
            <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 text-center">
              <p className="text-xs text-slate-500 mb-1">총 변화</p>
              <p className={`text-2xl font-bold ${weightChange === null ? 'text-slate-600' : parseFloat(weightChange) < 0 ? 'text-blue-400' : parseFloat(weightChange) > 0 ? 'text-orange-400' : 'text-slate-400'}`}>
                {weightChange !== null ? `${parseFloat(weightChange) > 0 ? '+' : ''}${weightChange}` : '-'}
                {weightChange !== null && <span className="text-sm text-slate-500 ml-1">kg</span>}
              </p>
            </div>
          </div>

          {/* 그래프 */}
          <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
            <p className="text-sm font-semibold text-slate-300 mb-4">체중 변화 그래프</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis
                  yAxisId="weight"
                  domain={['auto', 'auto']}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={(v) => `${v}kg`}
                />
                {records.some(r => r.body_fat) && (
                  <YAxis
                    yAxisId="fat"
                    orientation="right"
                    domain={['auto', 'auto']}
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                )}
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1d27', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
                  formatter={(value, name) => name === '체중' ? [`${value}kg`, '체중'] : [`${value}%`, '체지방률']}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Line yAxisId="weight" type="monotone" dataKey="체중" stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 3 }} connectNulls />
                {records.some(r => r.body_fat) && (
                  <Line yAxisId="fat" type="monotone" dataKey="체지방" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 3 }} connectNulls />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 기록 리스트 */}
          <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-700/30">
                  <th className="text-left px-5 py-2.5">날짜</th>
                  <th className="text-right px-4 py-2.5">체중</th>
                  <th className="text-right px-4 py-2.5">체지방률</th>
                  <th className="text-left px-4 py-2.5">메모</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {[...records].reverse().map((r) => (
                  <tr key={r.id} className="border-b border-slate-700/20 last:border-0 hover:bg-slate-700/10">
                    <td className="px-5 py-2.5 text-slate-300">{r.date}</td>
                    <td className="px-4 py-2.5 text-right text-white font-semibold">{r.weight}kg</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">{r.body_fat ? `${r.body_fat}%` : '-'}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{r.notes ?? '-'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(r)} className="text-blue-500/70 hover:text-blue-400 transition" title="수정">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="text-red-500/50 hover:text-red-400 transition" title="삭제">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
