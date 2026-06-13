import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { Plus, Trash2, ChevronDown, ChevronUp, Copy } from 'lucide-react'

const DAYS = ['월', '화', '수', '목', '금', '토', '일']
const SET_TYPES = ['자유형', '배영', '평영', '접영', '개인혼영', '킥', '드릴', '풀', '웜업', '쿨다운', '기타']

const emptySet = { type: '자유형', distance: '', reps: 1, intensity: '중', note: '' }
const INTENSITIES = ['저', '중', '고', '최고']

const defaultForm = {
  name: '',
  day_of_week: null,
  total_distance_m: '',
  sets: [{ ...emptySet }],
  notes: '',
}

function SetRow({ set, index, onChange, onDelete, canDelete }) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-700/30 last:border-0">
      <div className="col-span-1 text-slate-500 text-xs text-center">{index + 1}</div>
      <div className="col-span-2">
        <select
          value={set.type}
          onChange={(e) => onChange(index, 'type', e.target.value)}
          className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
        >
          {SET_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <input
          type="number"
          value={set.distance}
          onChange={(e) => onChange(index, 'distance', e.target.value)}
          placeholder="거리(m)"
          className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="col-span-1">
        <input
          type="number"
          value={set.reps}
          onChange={(e) => onChange(index, 'reps', e.target.value)}
          min={1}
          placeholder="x"
          className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="col-span-2">
        <select
          value={set.intensity}
          onChange={(e) => onChange(index, 'intensity', e.target.value)}
          className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
        >
          {INTENSITIES.map((i) => <option key={i}>{i}</option>)}
        </select>
      </div>
      <div className="col-span-3">
        <input
          type="text"
          value={set.note}
          onChange={(e) => onChange(index, 'note', e.target.value)}
          placeholder="메모"
          className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="col-span-1 flex justify-center">
        {canDelete && (
          <button onClick={() => onDelete(index)} className="text-slate-600 hover:text-red-400 transition">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function RoutinePage({ embedded = false }) {
  const user = useAuthStore((s) => s.user)
  const [routines, setRoutines] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const fetchRoutines = async () => {
    const { data } = await supabase
      .from('routines')
      .select('*')
      .eq('user_id', user.id)
      .order('day_of_week', { ascending: true })
    setRoutines(data || [])
  }

  useEffect(() => { fetchRoutines() }, [])

  const handleSetChange = (index, field, value) => {
    setForm((f) => {
      const sets = [...f.sets]
      sets[index] = { ...sets[index], [field]: value }
      return { ...f, sets }
    })
  }

  const addSet = () => setForm((f) => ({ ...f, sets: [...f.sets, { ...emptySet }] }))
  const deleteSet = (i) => setForm((f) => ({ ...f, sets: f.sets.filter((_, idx) => idx !== i) }))

  // 총 거리 자동 계산
  const calcTotal = (sets) =>
    sets.reduce((s, set) => s + (parseInt(set.distance) || 0) * (parseInt(set.reps) || 1), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const total = calcTotal(form.sets)
    await supabase.from('routines').insert({
      user_id: user.id,
      name: form.name,
      day_of_week: form.day_of_week !== null ? parseInt(form.day_of_week) : null,
      total_distance_m: total || parseInt(form.total_distance_m) || 0,
      sets: form.sets,
      notes: form.notes,
    })
    setForm(defaultForm)
    setShowForm(false)
    fetchRoutines()
  }

  const handleDelete = async (id) => {
    if (!confirm('이 루틴을 삭제할까요?')) return
    await supabase.from('routines').delete().eq('id', id)
    setRoutines((r) => r.filter((x) => x.id !== id))
  }

  const handleCopy = (routine) => {
    setForm({
      name: routine.name + ' (복사)',
      day_of_week: routine.day_of_week,
      total_distance_m: routine.total_distance_m,
      sets: routine.sets || [{ ...emptySet }],
      notes: routine.notes || '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 요일별 그룹
  const byDay = DAYS.map((day, i) => ({
    day,
    idx: i,
    routines: routines.filter((r) => r.day_of_week === i),
  }))
  const undayedRoutines = routines.filter((r) => r.day_of_week === null)

  const intensityColor = { 저: 'text-green-400', 중: 'text-blue-400', 고: 'text-orange-400', 최고: 'text-red-400' }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`${embedded ? 'text-lg' : 'text-xl'} font-bold text-white`}>
            {embedded ? '루틴 템플릿' : '루틴 작성'}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">자주 쓰는 훈련 구성을 저장하고 계획에 불러오세요</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          새 루틴
        </button>
      </div>

      {/* 루틴 작성 폼 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="col-span-2">
              <label className="block text-sm text-slate-400 mb-1">루틴 이름</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="예: 월요일 장거리 훈련"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">요일 (선택)</label>
              <select
                value={form.day_of_week ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, day_of_week: e.target.value === '' ? null : parseInt(e.target.value) }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">요일 없음</option>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}요일</option>)}
              </select>
            </div>
          </div>

          {/* 세트 구성 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-slate-400">세트 구성</label>
              <span className="text-xs text-blue-400 font-medium">
                총 {calcTotal(form.sets).toLocaleString()}m
              </span>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-700/50">
              {/* 헤더 */}
              <div className="grid grid-cols-12 gap-2 text-xs text-slate-600 mb-1 px-0">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-2">종류</div>
                <div className="col-span-2">거리(m)</div>
                <div className="col-span-1">횟수</div>
                <div className="col-span-2">강도</div>
                <div className="col-span-3">메모</div>
                <div className="col-span-1"></div>
              </div>
              {form.sets.map((set, i) => (
                <SetRow
                  key={i}
                  set={set}
                  index={i}
                  onChange={handleSetChange}
                  onDelete={deleteSet}
                  canDelete={form.sets.length > 1}
                />
              ))}
              <button
                type="button"
                onClick={addSet}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition"
              >
                <Plus size={12} /> 세트 추가
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-1">메모 (선택)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="훈련 목적, 주의사항 등"
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">저장</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-5 py-2 rounded-lg transition">취소</button>
          </div>
        </form>
      )}

      {/* 요일별 루틴 */}
      {routines.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-4xl mb-3">📋</p>
          <p>저장된 루틴이 없습니다.</p>
          <p className="text-sm mt-1">새 루틴 버튼을 눌러 훈련 루틴을 만들어보세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 요일별 */}
          {byDay.filter((d) => d.routines.length > 0).map(({ day, routines: dayRoutines }) => (
            <div key={day}>
              <p className="text-xs text-slate-500 font-medium mb-2 px-1">{day}요일</p>
              <div className="space-y-2">
                {dayRoutines.map((r) => (
                  <RoutineCard
                    key={r.id}
                    routine={r}
                    expanded={expandedId === r.id}
                    onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    onDelete={handleDelete}
                    onCopy={handleCopy}
                    intensityColor={intensityColor}
                  />
                ))}
              </div>
            </div>
          ))}
          {/* 요일 미지정 */}
          {undayedRoutines.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-2 px-1">요일 미지정</p>
              <div className="space-y-2">
                {undayedRoutines.map((r) => (
                  <RoutineCard
                    key={r.id}
                    routine={r}
                    expanded={expandedId === r.id}
                    onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    onDelete={handleDelete}
                    onCopy={handleCopy}
                    intensityColor={intensityColor}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RoutineCard({ routine, expanded, onToggle, onDelete, onCopy, intensityColor }) {
  return (
    <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-slate-700/20 transition"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-medium text-sm">{routine.name}</span>
          <span className="text-blue-400 text-xs">{routine.total_distance_m?.toLocaleString()}m</span>
          {routine.sets?.length > 0 && (
            <span className="text-slate-500 text-xs">{routine.sets.length}세트</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(routine) }}
            className="text-slate-500 hover:text-blue-400 transition"
            title="복사"
          >
            <Copy size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(routine.id) }}
            className="text-slate-500 hover:text-red-400 transition"
          >
            <Trash2 size={14} />
          </button>
          {expanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
        </div>
      </div>

      {expanded && routine.sets?.length > 0 && (
        <div className="border-t border-slate-700/30 px-5 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-600 border-b border-slate-700/30">
                <th className="text-left py-1 pr-3">#</th>
                <th className="text-left py-1 pr-3">종류</th>
                <th className="text-left py-1 pr-3">거리</th>
                <th className="text-left py-1 pr-3">횟수</th>
                <th className="text-left py-1 pr-3">강도</th>
                <th className="text-left py-1">메모</th>
              </tr>
            </thead>
            <tbody>
              {routine.sets.map((set, i) => (
                <tr key={i} className="border-b border-slate-700/20 last:border-0">
                  <td className="py-1.5 pr-3 text-slate-500">{i + 1}</td>
                  <td className="py-1.5 pr-3 text-slate-300">{set.type}</td>
                  <td className="py-1.5 pr-3 text-white">{parseInt(set.distance) * parseInt(set.reps)}m</td>
                  <td className="py-1.5 pr-3 text-slate-400">{set.distance}×{set.reps}</td>
                  <td className={`py-1.5 pr-3 font-medium ${intensityColor[set.intensity] ?? 'text-slate-400'}`}>{set.intensity}</td>
                  <td className="py-1.5 text-slate-500">{set.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {routine.notes && (
            <p className="text-slate-500 text-xs mt-3 bg-slate-700/20 rounded px-3 py-2">{routine.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}
