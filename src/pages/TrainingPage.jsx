import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { getTrainingFeedback } from '../lib/gemini'
import { Plus, ChevronDown, ChevronUp, Bot } from 'lucide-react'

const METRIC_CONFIG = {
  condition_score: { label: '컨디션', low: [1,3], mid: [4,6], high: [7,10], lowColor: '#ef4444', midColor: '#f59e0b', highColor: '#22c55e' },
  rpe: { label: 'RPE', low: [1,4], mid: [5,7], high: [8,10], lowColor: '#3b82f6', midColor: '#f59e0b', highColor: '#ef4444' },
  forearm_fatigue: { label: '전완근 피로', low: [1,3], mid: [4,6], high: [7,10], lowColor: '#22c55e', midColor: '#f59e0b', highColor: '#ef4444' },
}

function getColor(value, metric) {
  if (value == null) return '#1e293b'
  const cfg = METRIC_CONFIG[metric]
  if (value <= cfg.low[1]) return cfg.lowColor
  if (value <= cfg.mid[1]) return cfg.midColor
  return cfg.highColor
}

function buildHeatmap(logs, metric) {
  const logMap = {}
  logs.forEach(l => { logMap[l.date] = l })
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  // Start from Monday 12 weeks ago
  const start = new Date(today)
  start.setDate(start.getDate() - 83)
  const dow = start.getDay()
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))
  const days = []
  const cur = new Date(start)
  while (cur.toISOString().slice(0, 10) <= todayStr) {
    const d = cur.toISOString().slice(0, 10)
    days.push({ date: d, value: logMap[d]?.[metric] ?? null, log: logMap[d] ?? null })
    cur.setDate(cur.getDate() + 1)
  }
  // Pad to multiple of 7
  while (days.length % 7 !== 0) days.push({ date: null, value: null, log: null })
  // Group into weeks (columns)
  const weeks = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

const defaultForm = {
  date: new Date().toISOString().slice(0, 10),
  total_distance_m: '',
  main_event: '자유형 1500m',
  stroke_count_avg: '',
  rpe: 7,
  sleep_hours: '',
  condition_score: 7,
  forearm_fatigue: 3,
  notes: '',
}

function SliderField({ label, name, value, min, max, onChange, color = 'blue' }) {
  const colors = { blue: '#3b82f6', orange: '#f97316', red: '#ef4444' }
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
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: colors[color] }}
      />
      <div className="flex justify-between text-xs text-slate-600 mt-0.5">
        <span>{min}</span><span>{max}</span>
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
  const [feedbacks, setFeedbacks] = useState({})
  const [generatingFeedback, setGeneratingFeedback] = useState(false)
  const [heatMetric, setHeatMetric] = useState('condition_score')
  const [heatTooltip, setHeatTooltip] = useState(null)

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('training_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(50)
    setLogs(data || [])
    if (data?.length) fetchFeedbacks(data.map((l) => l.id))
  }

  useEffect(() => { fetchLogs() }, [])

  const fetchFeedbacks = async (logIds) => {
    if (!logIds.length) return
    const { data } = await supabase
      .from('training_feedback')
      .select('*')
      .in('log_id', logIds)
    if (data) {
      const map = {}
      data.forEach((f) => { map[f.log_id] = f.feedback })
      setFeedbacks(map)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    const payload = {
      ...form,
      user_id: user.id,
      total_distance_m: parseInt(form.total_distance_m) || 0,
      stroke_count_avg: parseInt(form.stroke_count_avg) || null,
      rpe: parseInt(form.rpe),
      sleep_hours: parseFloat(form.sleep_hours) || null,
      condition_score: parseInt(form.condition_score),
      forearm_fatigue: parseInt(form.forearm_fatigue),
    }
    const { data: inserted } = await supabase
      .from('training_logs')
      .insert(payload)
      .select()
      .single()

    setForm(defaultForm)
    setShowForm(false)
    setSubmitting(false)
    await fetchLogs()

    // AI 피드백 생성
    if (inserted) {
      setGeneratingFeedback(true)
      setExpandedId(inserted.id)
      try {
        const recentLogs = logs.slice(0, 7)
        const feedbackText = await getTrainingFeedback(inserted, recentLogs)
        await supabase.from('training_feedback').insert({
          user_id: user.id,
          log_id: inserted.id,
          feedback: feedbackText,
        })
        setFeedbacks((prev) => ({ ...prev, [inserted.id]: feedbackText }))
      } catch (e) {
        setFeedbacks((prev) => ({ ...prev, [inserted.id]: e.message || 'AI 피드백 생성 중 오류가 발생했습니다.' }))
      } finally {
        setGeneratingFeedback(false)
      }
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('이 훈련 일지를 삭제할까요?')) return
    await supabase.from('training_logs').delete().eq('id', id)
    setLogs((l) => l.filter((x) => x.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">훈련 일지</h1>
          <p className="text-slate-400 text-sm mt-0.5">매일 훈련을 기록하세요</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          새 일지
        </button>
      </div>

      {/* Input Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">훈련 기록 입력</h2>
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
              <label className="block text-sm text-slate-400 mb-1">주 종목</label>
              <select
                name="main_event"
                value={form.main_event}
                onChange={handleChange}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {['자유형 1500m', '자유형 800m', '자유형 400m', '개인혼영 400m', '기타'].map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">평균 스트로크 수 (선택)</label>
              <input
                type="number"
                name="stroke_count_avg"
                value={form.stroke_count_avg}
                onChange={handleChange}
                placeholder="예: 38"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
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
            <SliderField label="RPE (운동 자각도)" name="rpe" value={form.rpe} min={1} max={10} onChange={handleChange} color="orange" />
            <SliderField label="컨디션" name="condition_score" value={form.condition_score} min={1} max={10} onChange={handleChange} color="blue" />
            <SliderField label="전완근 피로도" name="forearm_fatigue" value={form.forearm_fatigue} min={1} max={10} onChange={handleChange} color="red" />
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
              {submitting ? '저장 중...' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-5 py-2 rounded-lg transition"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {/* 컨디션 히트맵 */}
      {logs.length > 0 && (() => {
        const weeks = buildHeatmap(logs, heatMetric)
        const DOW = ['월', '화', '수', '목', '금', '토', '일']
        return (
          <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-300">훈련 히트맵 (최근 12주)</h2>
              <div className="flex gap-1">
                {Object.entries(METRIC_CONFIG).map(([key, cfg]) => (
                  <button key={key} onClick={() => setHeatMetric(key)}
                    className={`text-xs px-2.5 py-1 rounded-md transition ${heatMetric === key ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300'}`}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1 relative">
              {/* Day labels */}
              <div className="flex flex-col gap-1 mr-1">
                {DOW.map(d => <div key={d} className="h-[14px] text-[10px] text-slate-600 flex items-center">{d}</div>)}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map((day, di) => (
                    <div
                      key={di}
                      className="w-[14px] h-[14px] rounded-sm cursor-pointer transition hover:opacity-80 hover:ring-1 hover:ring-white/30"
                      style={{ backgroundColor: day.date ? getColor(day.value, heatMetric) : 'transparent' }}
                      onMouseEnter={() => day.date && day.log && setHeatTooltip({ date: day.date, log: day.log })}
                      onMouseLeave={() => setHeatTooltip(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
            {heatTooltip && (
              <div className="mt-3 bg-[#0f1117] rounded-lg px-3 py-2 text-xs text-slate-300 border border-slate-700/50">
                <span className="text-slate-500 mr-2">{heatTooltip.date}</span>
                <span className="mr-3">컨디션 <span className="text-green-400 font-semibold">{heatTooltip.log.condition_score}</span></span>
                <span className="mr-3">RPE <span className="text-orange-400 font-semibold">{heatTooltip.log.rpe}</span></span>
                <span>전완근 <span className="text-red-400 font-semibold">{heatTooltip.log.forearm_fatigue}</span></span>
                {heatTooltip.log.total_distance_m && <span className="ml-3 text-blue-400">{heatTooltip.log.total_distance_m.toLocaleString()}m</span>}
              </div>
            )}
            <div className="flex items-center gap-3 mt-3">
              <span className="text-xs text-slate-600">낮음</span>
              {[METRIC_CONFIG[heatMetric].lowColor, METRIC_CONFIG[heatMetric].midColor, METRIC_CONFIG[heatMetric].highColor].map((c, i) => (
                <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
              ))}
              <span className="text-xs text-slate-600">높음</span>
              <span className="text-xs text-slate-700 ml-2">— 회색: 휴식일</span>
            </div>
          </div>
        )
      })()}

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
                className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-slate-700/20 transition"
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <div className="flex items-center gap-4">
                  <span className="text-white font-medium text-sm">{log.date}</span>
                  <span className="text-slate-400 text-sm">{log.main_event}</span>
                </div>
                <div className="flex items-center gap-5 text-sm">
                  <span className="text-blue-400 font-semibold">{log.total_distance_m}m</span>
                  <span className="text-slate-400">RPE <span className="text-orange-400">{log.rpe}</span></span>
                  <span className="text-slate-400">컨디션 <span className="text-purple-400">{log.condition_score}</span></span>
                  {expandedId === log.id ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                </div>
              </div>

              {expandedId === log.id && (
                <div className="px-5 pb-4 border-t border-slate-700/30">
                  <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                    <div><span className="text-slate-500">수면</span> <span className="text-white ml-2">{log.sleep_hours ?? '-'}h</span></div>
                    <div><span className="text-slate-500">스트로크</span> <span className="text-white ml-2">{log.stroke_count_avg ?? '-'}</span></div>
                    <div><span className="text-slate-500">전완근 피로</span> <span className="text-red-400 ml-2">{log.forearm_fatigue}/10</span></div>
                  </div>
                  {log.notes && (
                    <p className="text-slate-400 text-sm mt-3 bg-slate-700/20 rounded-lg px-3 py-2">{log.notes}</p>
                  )}

                  {/* AI 피드백 */}
                  <div className="mt-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Bot size={13} className="text-blue-400" />
                      <span className="text-xs text-blue-400 font-medium">AI 코치 피드백</span>
                    </div>
                    {generatingFeedback && expandedId === log.id ? (
                      <p className="text-xs text-slate-400 animate-pulse">분석 중...</p>
                    ) : feedbacks[log.id] ? (
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{feedbacks[log.id]}</p>
                    ) : (
                      <p className="text-xs text-slate-500">피드백 없음</p>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(log.id)}
                    className="mt-3 text-xs text-red-500 hover:text-red-400 transition"
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
