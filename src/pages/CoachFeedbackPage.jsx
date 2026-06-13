import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

const categoryOrder = ['수영 피드백', '근력 피드백', '멘탈 피드백', '신체 피드백', '다음 훈련 지시', '코치 메모']

function formatDateLabel(date) {
  const parsed = new Date(`${date}T00:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${date.slice(5).replace('-', '/')} (${weekdays[parsed.getDay()]})`
}

export default function CoachFeedbackPage() {
  const user = useAuthStore((s) => s.user)
  const [feedbacks, setFeedbacks] = useState([])
  const [replies, setReplies] = useState([])
  const [replyDrafts, setReplyDrafts] = useState({})
  const [selectedDate, setSelectedDate] = useState('all')
  const [loading, setLoading] = useState(true)
  const [savingReplyId, setSavingReplyId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const fetchFeedbacks = async () => {
      if (!user?.id) return
      setLoading(true)
      setErrorMessage('')
      const { data: notes, error: notesError } = await supabase
        .from('coach_notes')
        .select('*')
        .eq('athlete_id', user.id)
        .order('note_date', { ascending: false })
        .limit(50)

      const { data: replyRows, error: repliesError } = await supabase
        .from('coach_note_replies')
        .select('*')
        .eq('athlete_id', user.id)
        .order('created_at', { ascending: true })
        .limit(100)

      if (notesError || repliesError) {
        setErrorMessage(notesError?.message || repliesError?.message || '코치 피드백을 불러오지 못했습니다.')
      }
      setFeedbacks(notes || [])
      setReplies(replyRows || [])
      setLoading(false)
    }
    fetchFeedbacks()
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return undefined

    const notesChannel = supabase
      .channel(`coach-notes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'coach_notes',
          filter: `athlete_id=eq.${user.id}`,
        },
        (payload) => {
          setFeedbacks((current) => {
            if (payload.eventType === 'INSERT') {
              if (current.some((item) => item.id === payload.new.id)) return current
              return [payload.new, ...current]
            }
            if (payload.eventType === 'UPDATE') return current.map((item) => item.id === payload.new.id ? payload.new : item)
            if (payload.eventType === 'DELETE') return current.filter((item) => item.id !== payload.old.id)
            return current
          })
        },
      )
      .subscribe()

    const repliesChannel = supabase
      .channel(`coach-note-replies-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'coach_note_replies',
          filter: `athlete_id=eq.${user.id}`,
        },
        (payload) => {
          setReplies((current) => {
            if (payload.eventType === 'INSERT') {
              if (current.some((item) => item.id === payload.new.id)) return current
              return [...current, payload.new]
            }
            if (payload.eventType === 'UPDATE') return current.map((item) => item.id === payload.new.id ? payload.new : item)
            if (payload.eventType === 'DELETE') return current.filter((item) => item.id !== payload.old.id)
            return current
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(notesChannel)
      supabase.removeChannel(repliesChannel)
    }
  }, [user?.id])

  const dateOptions = useMemo(() => {
    const dates = [
      ...feedbacks.map((item) => item.note_date),
      ...replies.map((item) => item.reply_date),
    ].filter(Boolean)
    return [...new Set(dates)].sort((a, b) => b.localeCompare(a))
  }, [feedbacks, replies])

  const visibleFeedbacks = useMemo(() => {
    if (selectedDate === 'all') return feedbacks
    const noteIdsWithReplyOnDate = new Set(replies.filter((reply) => reply.reply_date === selectedDate).map((reply) => reply.note_id))
    return feedbacks.filter((item) => item.note_date === selectedDate || noteIdsWithReplyOnDate.has(item.id))
  }, [feedbacks, replies, selectedDate])

  const grouped = useMemo(() => {
    return categoryOrder.map((category) => ({
      category,
      items: visibleFeedbacks.filter((item) => item.category === category),
    })).filter((group) => group.items.length || group.category !== '코치 메모')
  }, [visibleFeedbacks])

  const repliesByNote = useMemo(() => {
    return replies.reduce((map, reply) => {
      if (!map[reply.note_id]) map[reply.note_id] = []
      map[reply.note_id].push(reply)
      return map
    }, {})
  }, [replies])

  const saveReply = async (feedback) => {
    const content = replyDrafts[feedback.id]?.trim()
    if (!content) return
    setErrorMessage('')
    setSavingReplyId(feedback.id)
    const { data, error } = await supabase
      .from('coach_note_replies')
      .insert({
        note_id: feedback.id,
        coach_id: feedback.coach_id,
        athlete_id: user.id,
        sender_id: user.id,
        sender_role: 'athlete',
        content,
        reply_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()

    if (error) {
      setErrorMessage(`답글 저장 실패: ${error.message}`)
    } else if (data) {
      setReplies((current) => current.some((item) => item.id === data.id) ? current : [...current, data])
      setReplyDrafts((current) => ({ ...current, [feedback.id]: '' }))
    }
    setSavingReplyId(null)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">코치 피드백</h1>
        <p className="text-slate-400 text-sm mt-0.5">코치가 보낸 피드백을 확인하고 궁금한 점을 답글로 남기세요</p>
      </div>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-5">
          <p className="text-sm text-red-400">{errorMessage}</p>
        </div>
      )}

      <div className="mb-5">
        <p className="text-xs text-slate-500 mb-2">날짜별 보기</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedDate('all')}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              selectedDate === 'all'
                ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                : 'border-slate-700 text-slate-500 hover:border-slate-500'
            }`}
          >
            전체
          </button>
          {dateOptions.map((date) => (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDate(date)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                selectedDate === date
                  ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                  : 'border-slate-700 text-slate-500 hover:border-slate-500'
              }`}
            >
              {formatDateLabel(date)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">피드백을 불러오는 중입니다.</p>
      ) : visibleFeedbacks.length ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {grouped.map((group) => (
            <section key={group.category} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={16} className="text-blue-400" />
                <h2 className="text-sm font-semibold text-slate-300">{group.category}</h2>
              </div>
              <div className="space-y-3">
                {group.items.length ? group.items.map((item) => (
                  <div key={item.id} className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-3">
                    <p className="text-xs text-slate-500 mb-1">{item.note_date}</p>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{item.content}</p>

                    <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                      {(repliesByNote[item.id] || []).map((reply) => (
                        <div
                          key={reply.id}
                          className={`rounded-lg border px-3 py-2 ${
                            reply.sender_role === 'coach'
                              ? 'border-purple-500/20 bg-purple-500/5'
                              : 'border-blue-500/20 bg-blue-500/5'
                          }`}
                        >
                          <p className={`text-xs mb-1 ${reply.sender_role === 'coach' ? 'text-purple-300' : 'text-blue-300'}`}>
                            {reply.sender_role === 'coach' ? '코치 답글' : '내 답글'} · {reply.reply_date}
                          </p>
                          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{reply.content}</p>
                        </div>
                      ))}

                      <textarea
                        value={replyDrafts[item.id] || ''}
                        onChange={(event) => setReplyDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                        rows={3}
                        placeholder="코치에게 질문하거나 확인하고 싶은 내용을 답글로 남기세요."
                        className="w-full bg-[#111827] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => saveReply(item)}
                        disabled={savingReplyId === item.id || !replyDrafts[item.id]?.trim()}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                      >
                        <Send size={13} />
                        답글 보내기
                      </button>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-slate-500">아직 받은 피드백이 없습니다.</p>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-8 text-center">
          <p className="text-3xl mb-3">💬</p>
          <p className="text-slate-300 font-semibold">{feedbacks.length ? '선택한 날짜에 표시할 피드백이 없습니다.' : '아직 받은 코치 피드백이 없습니다.'}</p>
          <p className="text-slate-500 text-sm mt-1">코치가 피드백을 보내면 이곳에 종류별로 표시됩니다.</p>
        </div>
      )}
    </div>
  )
}
