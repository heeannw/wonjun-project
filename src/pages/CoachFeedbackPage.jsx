import { useEffect, useMemo, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

const categoryOrder = ['수영 피드백', '근력 피드백', '멘탈 피드백', '신체 피드백', '다음 훈련 지시', '코치 메모']

export default function CoachFeedbackPage() {
  const user = useAuthStore((s) => s.user)
  const [feedbacks, setFeedbacks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchFeedbacks = async () => {
      if (!user?.id) return
      setLoading(true)
      const { data } = await supabase
        .from('coach_notes')
        .select('*')
        .eq('athlete_id', user.id)
        .order('note_date', { ascending: false })
        .limit(50)
      setFeedbacks(data || [])
      setLoading(false)
    }
    fetchFeedbacks()
  }, [user?.id])

  const grouped = useMemo(() => {
    return categoryOrder.map((category) => ({
      category,
      items: feedbacks.filter((item) => item.category === category),
    })).filter((group) => group.items.length || group.category !== '코치 메모')
  }, [feedbacks])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">코치 피드백</h1>
        <p className="text-slate-400 text-sm mt-0.5">코치가 보낸 수영, 근력, 멘탈, 신체 피드백을 확인하세요</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">피드백을 불러오는 중입니다.</p>
      ) : feedbacks.length ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {grouped.map((group) => (
            <section key={group.category} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={16} className="text-blue-400" />
                <h2 className="text-sm font-semibold text-slate-300">{group.category}</h2>
              </div>
              <div className="space-y-2">
                {group.items.length ? group.items.map((item) => (
                  <div key={item.id} className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-500 mb-1">{item.note_date}</p>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{item.content}</p>
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
          <p className="text-slate-300 font-semibold">아직 받은 코치 피드백이 없습니다.</p>
          <p className="text-slate-500 text-sm mt-1">코치가 피드백을 보내면 이곳에 종류별로 표시됩니다.</p>
        </div>
      )}
    </div>
  )
}
