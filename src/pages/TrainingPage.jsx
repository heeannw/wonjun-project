import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { Plus, ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const METRIC_CONFIG = {
  condition_score: { label: '컨디션', color: '#22c55e' },
  rpe: { label: '운동 강도', color: '#f97316' },
  forearm_fatigue: { label: '신체 피로', color: '#ef4444' },
}

const TRAINING_EVENTS = [
  '자유형 50m',
  '자유형 100m',
  '자유형 200m',
  '자유형 400m',
  '자유형 800m',
  '자유형 1500m',
  '배영 50m',
  '배영 100m',
  '배영 200m',
  '평영 50m',
  '평영 100m',
  '평영 200m',
  '접영 50m',
  '접영 100m',
  '접영 200m',
  '개인혼영 100m',
  '개인혼영 200m',
  '개인혼영 400m',
  '킥',
  '드릴',
  '풀',
  '웨이트',
  '회복',
  '회복훈련',
  '기타',
]

const SET_TYPES = ['자유형', '배영', '평영', '접영', '개인혼영', '킥', '드릴', '풀', '웜업', '쿨다운', '기타']
const INTENSITIES = ['최저', '저', '중', '고', '최고']
const EQUIPMENT_OPTIONS = ['킥판', '풀부이', '패들', '스노클', '숏핀', '롱핀', '밴드']
const emptySet = {
  type: '자유형',
  distance: '',
  reps: 1,
  set_count: 1,
  intensity: '중',
  equipment: [],
  cycle_minutes: '',
  cycle_seconds: '',
  dive_count: '',
  note: '',
}

const defaultForm = {
  date: new Date().toISOString().slice(0, 10),
  total_distance_m: '',
  main_event: '자유형 1500m',
  rpe: 7,
  sleep_hours: '',
  condition_score: 7,
  forearm_fatigue: 3,
  sets: [{ ...emptySet }],
  notes: '',
}

function calcSetTotal(sets) {
  return sets.reduce(
    (sum, set) => sum + (parseInt(set.distance) || 0) * (parseInt(set.reps) || 1) * (parseInt(set.set_count) || 1),
    0,
  )
}

function getValidSets(sets) {
  return sets
    .map((set) => ({
      type: set.type,
      distance: parseInt(set.distance) || 0,
      reps: parseInt(set.reps) || 1,
      set_count: parseInt(set.set_count) || 1,
      intensity: set.intensity,
      equipment: Array.isArray(set.equipment) ? set.equipment : [],
      cycle_minutes: parseInt(set.cycle_minutes) || null,
      cycle_seconds: parseInt(set.cycle_seconds) || null,
      dive_count: parseInt(set.dive_count) || null,
      note: set.note?.trim() || '',
    }))
    .filter((set) => set.distance > 0)
}

function formatSets(sets) {
  const validSets = getValidSets(sets)
  if (!validSets.length) return ''
  return validSets
    .map((set, index) => {
      const total = set.distance * set.reps * set.set_count
      const note = set.note ? ` · ${set.note}` : ''
      const equipment = set.equipment.length ? ` · 장비 ${set.equipment.join(', ')}` : ''
      const cycle = set.cycle_minutes || set.cycle_seconds ? ` · 사이클 ${set.cycle_minutes || 0}분 ${set.cycle_seconds || 0}초` : ''
      const dive = set.dive_count ? ` · 다이브 ${set.dive_count}회` : ''
      return `${index + 1}. ${set.type} ${set.distance}m × ${set.reps}회 × ${set.set_count}세트 (${total}m, ${set.intensity})${equipment}${cycle}${dive}${note}`
    })
    .join('\n')
}

function SliderField({ label, name, value, min, max, onChange, color = 'blue' }) {
  const colors = { blue: '#3b82f6', orange: '#f97316', red: '#ef4444' }
  const trackColor = colors[color]
  const progress = ((Number(value) - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <label className="text-slate-400">{label}</label>
        <span className="text-white font-semibold">{value}</span>
      </div>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        className="training-score-slider w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          '--slider-color': trackColor,
          background: `linear-gradient(to right, ${trackColor} 0%, ${trackColor} ${progress}%, ${trackColor}33 ${progress}%, ${trackColor}33 100%)`,
        }}
      />
      <div className="flex justify-between text-xs text-slate-600 mt-0.5">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  )
}

function SetRow({ set, index, onChange, onDelete, canDelete }) {
  const toggleEquipment = (equipment) => {
    const currentEquipment = Array.isArray(set.equipment) ? set.equipment : []
    onChange(
      index,
      'equipment',
      currentEquipment.includes(equipment)
        ? currentEquipment.filter((item) => item !== equipment)
        : [...currentEquipment, equipment],
    )
  }

  return (
    <div className="border-b border-slate-700/30 py-3 last:border-0">
      <div className="grid grid-cols-12 gap-2 items-center">
        <div className="col-span-1 text-slate-500 text-xs text-center">{index + 1}</div>
        <div className="col-span-2">
        <select
          value={set.type}
          onChange={(e) => onChange(index, 'type', e.target.value)}
          className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
        >
          {SET_TYPES.map((type) => <option key={type}>{type}</option>)}
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
          className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
        />
        </div>
        <div className="col-span-1">
        <input
          type="number"
          value={set.set_count ?? 1}
          onChange={(e) => onChange(index, 'set_count', e.target.value)}
          min={1}
          className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
        />
        </div>
        <div className="col-span-2">
        <select
          value={set.intensity}
          onChange={(e) => onChange(index, 'intensity', e.target.value)}
          className="w-full bg-[#0f1117] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
        >
          {INTENSITIES.map((intensity) => <option key={intensity}>{intensity}</option>)}
        </select>
        </div>
        <div className="col-span-2">
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
            <button type="button" onClick={() => onDelete(index)} className="text-slate-600 hover:text-red-400 transition">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="ml-[8.333%] mt-3 grid grid-cols-1 gap-3 rounded-lg border border-slate-800 bg-slate-900/30 p-3 md:grid-cols-[minmax(0,1fr)_90px_90px_100px]">
        <div>
          <p className="mb-1.5 text-[11px] text-slate-500">사용 장비</p>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPMENT_OPTIONS.map((equipment) => (
              <button
                key={equipment}
                type="button"
                onClick={() => toggleEquipment(equipment)}
                className={`rounded-full border px-2 py-1 text-[11px] transition ${
                  set.equipment?.includes(equipment)
                    ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                    : 'border-slate-700 text-slate-500 hover:border-slate-500'
                }`}
              >
                {equipment}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] text-slate-500">사이클 분</label>
          <input
            type="number"
            value={set.cycle_minutes ?? ''}
            onChange={(e) => onChange(index, 'cycle_minutes', e.target.value)}
            min={0}
            placeholder="0"
            className="w-full rounded border border-slate-700 bg-[#0f1117] px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] text-slate-500">사이클 초</label>
          <input
            type="number"
            value={set.cycle_seconds ?? ''}
            onChange={(e) => onChange(index, 'cycle_seconds', e.target.value)}
            min={0}
            max={59}
            placeholder="00"
            className="w-full rounded border border-slate-700 bg-[#0f1117] px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] text-slate-500">다이브 횟수</label>
          <input
            type="number"
            value={set.dive_count ?? ''}
            onChange={(e) => onChange(index, 'dive_count', e.target.value)}
            min={0}
            placeholder="0"
            className="w-full rounded border border-slate-700 bg-[#0f1117] px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}

export default function TrainingPage() {
  const user = useAuthStore((s) => s.user)
  const [logs, setLogs] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const trendData = [...logs]
    .reverse()
    .slice(-30)
    .map((log) => ({
      date: log.date?.slice(5),
      컨디션: log.condition_score,
      운동강도: log.rpe,
      신체피로: log.forearm_fatigue,
      distance: log.total_distance_m,
      event: log.main_event,
    }))

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('training_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(50)
    setLogs(data || [])
  }

  useEffect(() => { fetchLogs() }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const handleSetChange = (index, field, value) => {
    setForm((f) => {
      const sets = [...f.sets]
      sets[index] = { ...sets[index], [field]: value }
      return { ...f, sets }
    })
  }

  const addSet = () => setForm((f) => ({ ...f, sets: [...f.sets, { ...emptySet }] }))
  const insertSet = (index) => {
    setForm((current) => ({
      ...current,
      sets: [
        ...current.sets.slice(0, index),
        { ...emptySet },
        ...current.sets.slice(index),
      ],
    }))
  }
  const deleteSet = (index) => setForm((f) => ({ ...f, sets: f.sets.filter((_, i) => i !== index) }))

  const resetForm = () => {
    setForm(defaultForm)
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (log) => {
    setForm({
      date: log.date || defaultForm.date,
      total_distance_m: log.total_distance_m ?? '',
      main_event: log.main_event || defaultForm.main_event,
      rpe: log.rpe ?? 7,
      sleep_hours: log.sleep_hours ?? '',
      condition_score: log.condition_score ?? 7,
      forearm_fatigue: log.forearm_fatigue ?? 3,
      sets: Array.isArray(log.sets) && log.sets.length
        ? log.sets.map((set) => ({
            ...emptySet,
            ...set,
            set_count: set.set_count || 1,
            equipment: Array.isArray(set.equipment) ? set.equipment : [],
          }))
        : [{ ...emptySet }],
      notes: log.notes || '',
    })
    setEditingId(log.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    const setSummary = formatSets(form.sets)
    const baseNotes = form.notes?.trim() || ''
    const validSets = getValidSets(form.sets)
    const payload = {
      ...form,
      user_id: user.id,
      total_distance_m: parseInt(form.total_distance_m) || 0,
      rpe: parseInt(form.rpe),
      sleep_hours: parseFloat(form.sleep_hours) || null,
      condition_score: parseInt(form.condition_score),
      forearm_fatigue: parseInt(form.forearm_fatigue),
      sets: validSets,
      notes: baseNotes || null,
    }

    const query = editingId
      ? supabase.from('training_logs').update(payload).eq('id', editingId)
      : supabase.from('training_logs').insert(payload)
    const { data: inserted, error } = await query.select().single()

    let savedLog = inserted
    if (error) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.sets
      fallbackPayload.notes = [baseNotes, setSummary ? `세트 구성:\n${setSummary}` : ''].filter(Boolean).join('\n\n') || null
      const fallbackQuery = editingId
        ? supabase.from('training_logs').update(fallbackPayload).eq('id', editingId)
        : supabase.from('training_logs').insert(fallbackPayload)
      const fallbackRes = await fallbackQuery.select().single()
      if (fallbackRes.error) {
        setSubmitting(false)
        alert(fallbackRes.error.message || error.message || '훈련 일지 저장 중 오류가 발생했습니다.')
        return
      }
      savedLog = fallbackRes.data
    }

    const savedLogId = savedLog?.id
    resetForm()
    setSubmitting(false)
    await fetchLogs()
    if (savedLogId) setExpandedId(savedLogId)
  }

  const handleDelete = async (id) => {
    if (!confirm('이 훈련 일지를 삭제할까요?')) return
    await supabase.from('training_logs').delete().eq('id', id)
    setLogs((l) => l.filter((x) => x.id !== id))
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">훈련 일지</h1>
          <p className="text-slate-400 text-sm mt-0.5">매일 훈련을 기록하세요</p>
        </div>
        <button
          onClick={() => {
            if (showForm) resetForm()
            else setShowForm(true)
          }}
          className="flex shrink-0 items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          새 일지
        </button>
      </div>

      {/* Input Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">{editingId ? '훈련 기록 수정' : '훈련 기록 입력'}</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">날짜</label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">총 거리 (m)</label>
              <input
                type="number"
                name="total_distance_m"
                value={form.total_distance_m}
                onChange={handleChange}
                step="50"
                placeholder="예: 8200"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">훈련 종목</label>
              <select
                name="main_event"
                value={form.main_event}
                onChange={handleChange}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {TRAINING_EVENTS.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">수면 시간 (h)</label>
              <input
                type="number"
                name="sleep_hours"
                value={form.sleep_hours}
                onChange={handleChange}
                step="0.5"
                placeholder="예: 7.5"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 mb-4">
            <SliderField label="운동 강도" name="rpe" value={form.rpe} min={1} max={10} onChange={handleChange} color="orange" />
            <SliderField label="컨디션" name="condition_score" value={form.condition_score} min={1} max={10} onChange={handleChange} color="blue" />
            <SliderField label="신체 피로도" name="forearm_fatigue" value={form.forearm_fatigue} min={1} max={10} onChange={handleChange} color="red" />
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-slate-400">세트 구성</label>
              <span className="text-xs text-blue-400">총 {calcSetTotal(form.sets).toLocaleString()}m</span>
            </div>
            <div className="bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] text-slate-600 px-1 pb-1">
                <span className="col-span-1 text-center">#</span>
                <span className="col-span-2">종류</span>
                <span className="col-span-2">거리(m)</span>
                <span className="col-span-1">횟수</span>
                <span className="col-span-1">세트</span>
                <span className="col-span-2">강도</span>
                <span className="col-span-2">메모</span>
                <span className="col-span-1" />
              </div>
              {form.sets.map((set, index) => (
                <div key={index}>
                  <SetRow
                    set={set}
                    index={index}
                    onChange={handleSetChange}
                    onDelete={deleteSet}
                    canDelete={form.sets.length > 1}
                  />
                  {index < form.sets.length - 1 && (
                    <div className="relative flex items-center justify-center py-1">
                      <div className="absolute inset-x-0 h-px bg-slate-800" />
                      <button
                        type="button"
                        onClick={() => insertSet(index + 1)}
                        className="relative inline-flex items-center gap-1 rounded-full border border-slate-700 bg-[#0f1117] px-2.5 py-1 text-[11px] text-blue-400 transition hover:border-blue-500/50 hover:text-blue-300"
                      >
                        <Plus size={12} />
                        여기에 세트 삽입
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button type="button" onClick={addSet} className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition">
                + 세트 추가
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-1">오늘 훈련 메모 (선택)</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={2}
              placeholder="오늘 훈련에서 느낀 점, 특이사항 등"
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition"
            >
              {submitting ? '저장 중...' : editingId ? '수정 완료' : '저장'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-5 py-2 rounded-lg transition"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {/* 컨디션 추이 */}
      {trendData.length > 0 && (
        <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">컨디션 추이 (최근 30일)</h2>
            <span className="text-xs text-slate-500">1 낮음 · 10 높음</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 6, right: 18, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f1117', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value, name) => [`${value}/10`, name]}
              />
              <Legend iconType="line" wrapperStyle={{ color: '#94a3b8', fontSize: 12, paddingTop: 8 }} />
              <Line type="monotone" dataKey="컨디션" stroke={METRIC_CONFIG.condition_score.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="운동강도" name="운동 강도" stroke={METRIC_CONFIG.rpe.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="신체피로" name="신체 피로" stroke={METRIC_CONFIG.forearm_fatigue.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Log List */}
      <div className="space-y-2">
        {logs.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-4xl mb-3">🏊</p>
            <p>아직 기록된 훈련이 없습니다.</p>
            <p className="text-sm mt-1">위 버튼을 눌러 첫 훈련을 기록해보세요!</p>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
              <div
                className="training-log-summary flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-700/20 transition"
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <div className="training-log-identity flex items-center gap-4">
                  <span className="text-white font-medium text-sm">{log.date}</span>
                  <span className="text-slate-400 text-sm">{log.main_event}</span>
                </div>
                <div className="training-log-metrics flex items-center gap-5 text-sm">
                  <span className="text-blue-400 font-semibold">{log.total_distance_m}m</span>
                  <span className="text-slate-400">운동 강도 <span className="text-orange-400">{log.rpe}</span></span>
                  <span className="text-slate-400">컨디션 <span className="text-purple-400">{log.condition_score}</span></span>
                  {expandedId === log.id ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                </div>
              </div>

              {expandedId === log.id && (
                <div className="px-5 pb-4 border-t border-slate-700/30">
                  <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                    <div><span className="text-slate-500">수면</span> <span className="text-white ml-2">{log.sleep_hours ?? '-'}h</span></div>
                    <div><span className="text-slate-500">세트 수</span> <span className="text-white ml-2">{log.sets?.length || 0}개</span></div>
                    <div><span className="text-slate-500">신체 피로</span> <span className="text-red-400 ml-2">{log.forearm_fatigue}/10</span></div>
                  </div>
                  {log.notes && (
                    <p className="text-slate-400 text-sm mt-3 bg-slate-700/20 rounded-lg px-3 py-2">{log.notes}</p>
                  )}

                  {Array.isArray(log.sets) && log.sets.length > 0 && (
                    <div className="mt-3 bg-[#0f1117] border border-slate-700/40 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-slate-400 mb-2">세트 구성</p>
                      <div className="space-y-1">
                        {log.sets.map((set, index) => (
                          <div key={index} className="flex items-center justify-between text-xs">
                            <div className="min-w-0">
                              <span className="text-slate-300">
                                {index + 1}. {set.type} {set.distance}m × {set.reps}회 × {set.set_count || 1}세트
                                {set.note ? <span className="text-slate-500"> · {set.note}</span> : null}
                              </span>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {[
                                  set.equipment?.length ? `장비 ${set.equipment.join(', ')}` : null,
                                  set.cycle_minutes || set.cycle_seconds ? `사이클 ${set.cycle_minutes || 0}분 ${set.cycle_seconds || 0}초` : null,
                                  set.dive_count ? `다이브 ${set.dive_count}회` : null,
                                ].filter(Boolean).join(' · ') || '추가 정보 없음'}
                              </p>
                            </div>
                            <span className="ml-3 shrink-0 text-slate-500">{set.intensity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleEdit(log)}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition"
                    >
                      <Pencil size={12} /> 수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(log.id)}
                      className="text-xs text-red-500 hover:text-red-400 transition"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
