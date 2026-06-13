import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { getTrainingFeedback } from '../lib/gemini'
import { useProfileStore } from '../store/profileStore'
import { Plus, ChevronDown, ChevronUp, Bot } from 'lucide-react'
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
  '기타',
]

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

async function fetchFeedbackContext(userId) {
  const [strengthRes, bodyRes, competitionsRes] = await Promise.all([
    supabase
      .from('strength_records')
      .select('date, exercise, weight, reps, sets, notes')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(12),
    supabase
      .from('body_records')
      .select('date, weight, body_fat, notes')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(5),
    supabase
      .from('competitions')
      .select('id, name, start_date, end_date, events, pool_type, notes')
      .eq('user_id', userId)
      .order('start_date', { ascending: false })
      .limit(8),
  ])

  const competitions = competitionsRes.data || []
  const competitionIds = competitions.map((c) => c.id)
  const resultsRes = competitionIds.length
    ? await supabase
        .from('competition_results')
        .select('competition_id, event, record_time, rank, notes')
        .eq('user_id', userId)
        .in('competition_id', competitionIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  return {
    strengthRecords: strengthRes.data || [],
    bodyRecords: bodyRes.data || [],
    competitions,
    competitionResults: resultsRes.data || [],
  }
}

export default function TrainingPage() {
  const user = useAuthStore((s) => s.user)
  const profile = useProfileStore((s) => s.profile)
  const [logs, setLogs] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [feedbacks, setFeedbacks] = useState({})
  const [generatingFeedback, setGeneratingFeedback] = useState(false)

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
        const feedbackContext = await fetchFeedbackContext(user.id)
        const feedbackText = await getTrainingFeedback(inserted, recentLogs, profile, feedbackContext)
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
            <SliderField label="운동 강도" name="rpe" value={form.rpe} min={1} max={10} onChange={handleChange} color="orange" />
            <SliderField label="컨디션" name="condition_score" value={form.condition_score} min={1} max={10} onChange={handleChange} color="blue" />
            <SliderField label="신체 피로도" name="forearm_fatigue" value={form.forearm_fatigue} min={1} max={10} onChange={handleChange} color="red" />
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
                className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-slate-700/20 transition"
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <div className="flex items-center gap-4">
                  <span className="text-white font-medium text-sm">{log.date}</span>
                  <span className="text-slate-400 text-sm">{log.main_event}</span>
                </div>
                <div className="flex items-center gap-5 text-sm">
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
                    <div><span className="text-slate-500">스트로크</span> <span className="text-white ml-2">{log.stroke_count_avg ?? '-'}</span></div>
                    <div><span className="text-slate-500">신체 피로</span> <span className="text-red-400 ml-2">{log.forearm_fatigue}/10</span></div>
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
