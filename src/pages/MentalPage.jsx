import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { getMentalFeedback } from '../lib/gemini'
import { Plus, ChevronDown, ChevronUp, Bot, Pencil } from 'lucide-react'

const EMOTIONS = [
  { icon: '😤', label: '집중' },
  { icon: '💪', label: '자신감' },
  { icon: '😊', label: '평온' },
  { icon: '😐', label: '보통' },
  { icon: '😔', label: '피로' },
  { icon: '😟', label: '불안' },
]

const defaultForm = {
  date: new Date().toISOString().slice(0, 10),
  final_goal: '',
  todays_focus: '',
  good_point: '',
  improve_point: '',
  emotion: '😊',
  emotion_note: '',
  message_to_tomorrow: '',
}

export default function MentalPage() {
  const user = useAuthStore((s) => s.user)
  const profile = useProfileStore((s) => s.profile)
  const [journals, setJournals] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [feedbacks, setFeedbacks] = useState({})
  const [generatingId, setGeneratingId] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const fetch = async () => {
    const { data } = await supabase
      .from('mental_journals')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(30)
    const rows = data || []
    setJournals(rows)
    const feedbackMap = {}
    rows.forEach((row) => {
      if (row.ai_feedback) feedbackMap[row.id] = row.ai_feedback
    })
    setFeedbacks(feedbackMap)
  }

  useEffect(() => { fetch() }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const resetForm = () => {
    setForm(defaultForm)
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (journal) => {
    setForm({
      date: journal.date || defaultForm.date,
      final_goal: journal.final_goal || '',
      todays_focus: journal.todays_focus || '',
      good_point: journal.good_point || '',
      improve_point: journal.improve_point || '',
      emotion: journal.emotion || '😊',
      emotion_note: journal.emotion_note || '',
      message_to_tomorrow: journal.message_to_tomorrow || '',
    })
    setEditingId(journal.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form, user_id: user.id }
    const query = editingId
      ? supabase.from('mental_journals').update(payload).eq('id', editingId)
      : supabase.from('mental_journals').insert(payload)
    const { data: inserted, error } = await query.select().single()
    if (error) {
      alert(error.message || '멘탈 일지 저장 중 오류가 발생했습니다.')
      return
    }

    resetForm()
    setExpandedId(inserted.id)
    setGeneratingId(inserted.id)

    try {
      const feedback = await getMentalFeedback(inserted, journals, profile)
      setFeedbacks((prev) => ({ ...prev, [inserted.id]: feedback }))
      await supabase.from('mental_journals').update({ ai_feedback: feedback }).eq('id', inserted.id)
    } catch (e) {
      setFeedbacks((prev) => ({ ...prev, [inserted.id]: e.message || 'AI 조언 생성 중 오류가 발생했습니다.' }))
    } finally {
      setGeneratingId(null)
      fetch()
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">멘탈 일지</h1>
          <p className="text-slate-400 text-sm mt-0.5">목표를 매일 언어로 확인하세요</p>
        </div>
        <button
          onClick={() => {
            if (showForm) resetForm()
            else setShowForm(true)
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          오늘의 일지
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">{editingId ? '멘탈 일지 수정' : '멘탈 일지 작성'}</h2>
          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-1">날짜</label>
            <input type="date" name="date" value={form.date} onChange={handleChange}
              className="bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" required />
          </div>

          <div className="space-y-4 mb-5">
            <div>
              <label className="block text-sm font-medium text-blue-400 mb-1">Q1. 나의 최종 목표</label>
              <textarea name="final_goal" value={form.final_goal} onChange={handleChange}
                placeholder="2028 LA 올림픽 출전을 위해 내가 달성해야 할 기록은?"
                rows={2}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-400 mb-1">Q2. 오늘 훈련에서 집중한 것</label>
              <textarea name="todays_focus" value={form.todays_focus} onChange={handleChange}
                placeholder="오늘 가장 집중하고 싶었던 기술이나 요소"
                rows={2}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-green-400 mb-1">오늘 잘한 점</label>
                <textarea name="good_point" value={form.good_point} onChange={handleChange}
                  rows={2}
                  className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-orange-400 mb-1">더 해야 할 점</label>
                <textarea name="improve_point" value={form.improve_point} onChange={handleChange}
                  rows={2}
                  className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">현재 감정 상태</label>
              <div className="flex gap-3 mb-2">
                {EMOTIONS.map(({ icon, label }) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, emotion: icon }))}
                    className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs transition ${
                      form.emotion === icon ? 'bg-blue-600/30 border border-blue-500' : 'bg-slate-700/30 border border-slate-700 hover:bg-slate-700/50'
                    }`}
                  >
                    <span className="text-xl">{icon}</span>
                    <span className="text-slate-400 mt-0.5">{label}</span>
                  </button>
                ))}
              </div>
              <input name="emotion_note" value={form.emotion_note} onChange={handleChange}
                placeholder="감정에 대한 한 줄 메모"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-purple-400 mb-1">내일의 나에게 한 마디</label>
              <textarea name="message_to_tomorrow" value={form.message_to_tomorrow} onChange={handleChange}
                rows={2}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">{editingId ? '수정 완료' : '저장'}</button>
            <button type="button" onClick={resetForm} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-5 py-2 rounded-lg transition">취소</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {journals.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-4xl mb-3">🧠</p>
            <p>아직 멘탈 일지가 없습니다.</p>
          </div>
        ) : (
          journals.map((j) => (
            <div key={j.id} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-slate-700/20 transition"
                onClick={() => setExpandedId(expandedId === j.id ? null : j.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{j.emotion}</span>
                  <span className="text-white text-sm font-medium">{j.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-xs">{j.emotion_note}</span>
                  {expandedId === j.id ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                </div>
              </div>
              {expandedId === j.id && (
                <div className="px-5 pb-4 border-t border-slate-700/30 space-y-3 pt-3 text-sm">
                  {j.final_goal && <div><span className="text-blue-400 font-medium">목표: </span><span className="text-slate-300">{j.final_goal}</span></div>}
                  {j.todays_focus && <div><span className="text-slate-400 font-medium">집중: </span><span className="text-slate-300">{j.todays_focus}</span></div>}
                  {j.good_point && <div><span className="text-green-400 font-medium">잘한 점: </span><span className="text-slate-300">{j.good_point}</span></div>}
                  {j.improve_point && <div><span className="text-orange-400 font-medium">개선: </span><span className="text-slate-300">{j.improve_point}</span></div>}
                  {j.message_to_tomorrow && <div><span className="text-purple-400 font-medium">내일에게: </span><span className="text-slate-300 italic">"{j.message_to_tomorrow}"</span></div>}
                  <div className="mt-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Bot size={13} className="text-blue-400" />
                      <span className="text-xs text-blue-400 font-medium">AI 멘탈 코칭</span>
                    </div>
                    {generatingId === j.id ? (
                      <p className="text-xs text-slate-400 animate-pulse">조언 생성 중...</p>
                    ) : feedbacks[j.id] ? (
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{feedbacks[j.id]}</p>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          setGeneratingId(j.id)
                          try {
                            const feedback = await getMentalFeedback(j, journals.filter((row) => row.id !== j.id), profile)
                            setFeedbacks((prev) => ({ ...prev, [j.id]: feedback }))
                            await supabase.from('mental_journals').update({ ai_feedback: feedback }).eq('id', j.id)
                          } catch (e) {
                            setFeedbacks((prev) => ({ ...prev, [j.id]: e.message || 'AI 조언 생성 중 오류가 발생했습니다.' }))
                          } finally {
                            setGeneratingId(null)
                          }
                        }}
                        className="text-xs text-blue-300 hover:text-blue-200 transition"
                      >
                        조언 생성
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEdit(j)}
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition"
                  >
                    <Pencil size={12} /> 수정
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
