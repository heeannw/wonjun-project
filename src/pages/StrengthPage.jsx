import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { Plus, Trash2, ChevronDown, TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const EXERCISES = [
  '풀업', '친업', '딥스',
  '벤치프레스', '인클라인 벤치', '덤벨 벤치',
  '스쿼트', '레그프레스', '런지',
  '데드리프트', '루마니안 데드',
  '숄더프레스', '래터럴 레이즈',
  '바벨로우', '시티드로우', '케이블로우',
  '플랭크', '코어 훈련', '기타',
]

const defaultForm = {
  date: new Date().toISOString().slice(0, 10),
  exercise: '풀업',
  weight: '',
  reps: '',
  sets: '',
  notes: '',
}

export default function StrengthPage() {
  const user = useAuthStore((s) => s.user)
  const [records, setRecords] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [showForm, setShowForm] = useState(false)
  const [selectedEx, setSelectedEx] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchRecords = async () => {
    const { data } = await supabase
      .from('strength_records')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
    setRecords(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchRecords() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      user_id: user.id,
      weight: form.weight ? parseFloat(form.weight) : null,
      reps: form.reps ? parseInt(form.reps) : null,
      sets: form.sets ? parseInt(form.sets) : null,
    }
    await supabase.from('strength_records').insert(payload)
    setForm(defaultForm)
    setShowForm(false)
    fetchRecords()
  }

  const handleDelete = async (id) => {
    if (!confirm('삭제할까요?')) return
    await supabase.from('strength_records').delete().eq('id', id)
    setRecords((r) => r.filter((x) => x.id !== id))
  }

  // 종목별 그룹화
  const exerciseGroups = {}
  records.forEach((r) => {
    if (!exerciseGroups[r.exercise]) exerciseGroups[r.exercise] = []
    exerciseGroups[r.exercise].push(r)
  })

  const exercises = Object.keys(exerciseGroups)
  const activeEx = selectedEx || exercises[0] || null

  // 그래프 데이터: 종목별 최대 중량 or 최대 횟수 추이
  const chartData = activeEx
    ? [...exerciseGroups[activeEx]]
        .reverse()
        .map((r) => ({
          date: r.date?.slice(5),
          중량: r.weight,
          횟수: r.reps,
          volume: r.weight && r.reps && r.sets ? r.weight * r.reps * r.sets : null,
        }))
    : []

  const hasWeight = chartData.some((d) => d.중량)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">근력 기록</h1>
          <p className="text-slate-400 text-sm mt-0.5">웨이트 트레이닝 기록 추적</p>
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
        <form onSubmit={handleSubmit} className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">근력 기록 입력</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">날짜</label>
              <input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">종목</label>
              <div className="relative">
                <select value={form.exercise} onChange={(e) => setForm(f => ({ ...f, exercise: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none appearance-none">
                  {EXERCISES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">중량 (kg) <span className="text-slate-600">선택</span></label>
              <input type="number" value={form.weight} onChange={(e) => setForm(f => ({ ...f, weight: e.target.value }))}
                step="0.5" placeholder="예: 70"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">횟수 (reps)</label>
              <input type="number" value={form.reps} onChange={(e) => setForm(f => ({ ...f, reps: e.target.value }))}
                placeholder="예: 10"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">세트 수</label>
              <input type="number" value={form.sets} onChange={(e) => setForm(f => ({ ...f, sets: e.target.value }))}
                placeholder="예: 3"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">메모 <span className="text-slate-600">선택</span></label>
              <input type="text" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="예: 1RM 도전, 폼 교정 중"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">저장</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-5 py-2 rounded-lg transition">취소</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">불러오는 중...</p>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-4xl mb-3">💪</p>
          <p>아직 기록된 근력 훈련이 없습니다.</p>
          <p className="text-sm mt-1">위 버튼을 눌러 첫 기록을 추가해보세요.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 종목 탭 */}
          <div className="flex flex-wrap gap-2">
            {exercises.map(ex => (
              <button key={ex} onClick={() => setSelectedEx(ex)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition ${(activeEx === ex) ? 'bg-blue-600/30 border-blue-500/40 text-blue-300' : 'border-slate-700 text-slate-500 hover:text-white'}`}>
                {ex} <span className="text-slate-600 ml-1">{exerciseGroups[ex].length}</span>
              </button>
            ))}
          </div>

          {activeEx && (
            <>
              {/* 성장 그래프 */}
              {chartData.length >= 2 && (
                <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={14} className="text-blue-400" />
                    <h2 className="text-sm font-semibold text-slate-300">{activeEx} 추이</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                      <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1d27', border: '1px solid #334155', borderRadius: 8 }}
                        labelStyle={{ color: '#94a3b8' }}
                        formatter={(v, name) => [name === '중량' ? `${v}kg` : `${v}회`, name]}
                      />
                      {hasWeight && <Line type="monotone" dataKey="중량" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: '#3b82f6' }} />}
                      {!hasWeight && <Line type="monotone" dataKey="횟수" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: '#22c55e' }} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 기록 리스트 */}
              <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-700/30">
                  <p className="text-sm font-semibold text-slate-300">{activeEx} 기록</p>
                </div>
                <div className="divide-y divide-slate-700/20">
                  {exerciseGroups[activeEx].map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-4">
                        <span className="text-slate-400 text-sm w-24">{r.date}</span>
                        <div className="flex items-center gap-3 text-sm">
                          {r.weight && <span className="text-blue-400 font-semibold">{r.weight}kg</span>}
                          {r.reps && <span className="text-white">{r.reps}회</span>}
                          {r.sets && <span className="text-slate-500">× {r.sets}세트</span>}
                          {r.weight && r.reps && r.sets && (
                            <span className="text-xs text-slate-600">볼륨 {(r.weight * r.reps * r.sets).toLocaleString()}kg</span>
                          )}
                        </div>
                        {r.notes && <span className="text-xs text-slate-500">{r.notes}</span>}
                      </div>
                      <button onClick={() => handleDelete(r.id)} className="text-red-500/50 hover:text-red-400 transition">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
