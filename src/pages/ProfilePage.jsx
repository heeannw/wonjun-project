import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { Save, User, ChevronDown } from 'lucide-react'

const EVENT_OPTIONS = [
  '자유형 50m', '자유형 100m', '자유형 200m', '자유형 400m', '자유형 800m', '자유형 1500m',
  '배영 50m', '배영 100m', '배영 200m',
  '평영 50m', '평영 100m', '평영 200m',
  '접영 50m', '접영 100m', '접영 200m',
  '개인혼영 200m', '개인혼영 400m',
]

function calcKoreanAge(birthDateStr) {
  if (!birthDateStr) return null
  return new Date().getFullYear() - new Date(birthDateStr).getFullYear() + 1
}

function calcWesternAge(birthDateStr) {
  if (!birthDateStr) return null
  const today = new Date()
  const birth = new Date(birthDateStr)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function calcAgeAt(birthDateStr, targetDate) {
  if (!birthDateStr) return null
  const target = new Date(targetDate)
  const birth = new Date(birthDateStr)
  let age = target.getFullYear() - birth.getFullYear()
  const m = target.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && target.getDate() < birth.getDate())) age--
  return age
}

const defaultForm = {
  name: '',
  birth_date: '',
  team: '',
  coach: '',
  main_events: [],
  goal: '',
  notes: '',
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [profileId, setProfileId] = useState(null)

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('athlete_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()
      if (data) {
        setProfileId(data.id)
        setForm({
          name: data.name || '',
          birth_date: data.birth_date || '',
          team: data.team || '',
          coach: data.coach || '',
          main_events: data.main_events || [],
          goal: data.goal || '',
          notes: data.notes || '',
        })
      }
      setLoading(false)
    }
    fetchProfile()
  }, [])

  const toggleEvent = (ev) => {
    setForm((f) => ({
      ...f,
      main_events: f.main_events.includes(ev)
        ? f.main_events.filter((e) => e !== ev)
        : [...f.main_events, ev],
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      user_id: user.id,
      ...form,
      updated_at: new Date().toISOString(),
    }
    if (profileId) {
      await supabase.from('athlete_profiles').update(payload).eq('id', profileId)
    } else {
      const { data } = await supabase.from('athlete_profiles').insert(payload).select().single()
      if (data) setProfileId(data.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const westernAge = calcWesternAge(form.birth_date)
  const koreanAge = calcKoreanAge(form.birth_date)
  const olympicAge = calcAgeAt(form.birth_date, '2028-07-14')

  if (loading) return <div className="text-slate-400 text-sm">불러오는 중...</div>

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">선수 정보</h1>
        <p className="text-slate-400 text-sm mt-0.5">AI 분석 및 대시보드에 사용되는 기본 정보</p>
      </div>

      {/* 나이 요약 카드 */}
      {form.birth_date && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 text-center">
            <p className="text-xs text-slate-500 mb-1">만 나이 (현재)</p>
            <p className="text-2xl font-bold text-blue-400">{westernAge}세</p>
            <p className="text-xs text-slate-600 mt-1">국제 기준</p>
          </div>
          <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 text-center">
            <p className="text-xs text-slate-500 mb-1">한국 나이 (현재)</p>
            <p className="text-2xl font-bold text-purple-400">{koreanAge}세</p>
            <p className="text-xs text-slate-600 mt-1">세는 나이</p>
          </div>
          <div className="bg-[#1a1d27] rounded-xl p-4 border border-green-500/20 border text-center bg-green-500/5">
            <p className="text-xs text-slate-500 mb-1">올림픽 당시 나이</p>
            <p className="text-2xl font-bold text-green-400">{olympicAge}세</p>
            <p className="text-xs text-slate-600 mt-1">2028년 7월 14일</p>
          </div>
        </div>
      )}

      <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700/30">
          <User size={15} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-slate-300">기본 정보</h2>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">이름</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="예: 원준"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">생년월일</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm(f => ({ ...f, birth_date: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">소속 팀 / 학교</label>
              <input
                type="text"
                value={form.team}
                onChange={(e) => setForm(f => ({ ...f, team: e.target.value }))}
                placeholder="예: ○○고등학교"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">코치</label>
              <input
                type="text"
                value={form.coach}
                onChange={(e) => setForm(f => ({ ...f, coach: e.target.value }))}
                placeholder="예: 김○○ 코치"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">전문 종목 (복수 선택)</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_OPTIONS.map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => toggleEvent(ev)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                    form.main_events.includes(ev)
                      ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                      : 'bg-transparent border-slate-700 text-slate-500 hover:border-slate-500'
                  }`}
                >
                  {ev}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">목표</label>
            <input
              type="text"
              value={form.goal}
              onChange={(e) => setForm(f => ({ ...f, goal: e.target.value }))}
              placeholder="예: 2028 LA 올림픽 자유형 1500m 출전"
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">메모 (선택)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="예: 웨이트 트레이닝 미수행 중, 성장 여지 최대"
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 font-semibold px-5 py-2.5 rounded-lg transition text-sm ${
              saved
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white'
            }`}
          >
            <Save size={15} />
            {saving ? '저장 중...' : saved ? '저장됨 ✓' : '저장'}
          </button>
        </div>
      </div>

      {/* 이메일 */}
      <div className="mt-4 bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
        <p className="text-xs text-slate-500 mb-1">계정 이메일</p>
        <p className="text-sm text-slate-300">{user.email}</p>
      </div>
    </div>
  )
}
