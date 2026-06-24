import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { getCompetitionPrePlan, getCompetitionPostPlan, getCompetitionEvaluation } from '../lib/gemini'
import { useProfileStore } from '../store/profileStore'
import { Plus, CalendarDays, MapPin, Waves, ChevronDown, ChevronUp, Trash2, BrainCircuit, RefreshCw, ClipboardList, BarChart2, Pencil } from 'lucide-react'
import TimeInput from '../components/TimeInput'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from 'recharts'
import MeasuredChart from '../components/MeasuredChart'
import { timeToSeconds } from '../lib/fina'

const EVENT_OPTIONS = [
  '자유형 50m', '자유형 100m', '자유형 200m', '자유형 400m', '자유형 800m', '자유형 1500m',
  '배영 50m', '배영 100m', '배영 200m',
  '평영 50m', '평영 100m', '평영 200m',
  '접영 50m', '접영 100m', '접영 200m',
  '개인혼영 200m', '개인혼영 400m',
]

const defaultForm = {
  name: '', start_date: '', end_date: '', location: '', pool_type: '50m', events: [], notes: '',
}

const defaultResultForm = { event: '', record_time: '', rank: '', heat: '', notes: '' }

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

export default function CompetitionPage() {
  const user = useAuthStore((s) => s.user)
  const profile = useProfileStore((s) => s.profile)
  const [competitions, setCompetitions] = useState([])
  const [pbs, setPbs] = useState([])
  const [goalsMap, setGoalsMap] = useState({})
  const [results, setResults] = useState({}) // { competitionId: [result, ...] }
  const [form, setForm] = useState(defaultForm)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [pageTab, setPageTab] = useState('schedule') // 'schedule' | 'plan' | 'peak'
  const [selectedCompId, setSelectedCompId] = useState(null)
  const [generating, setGenerating] = useState({})
  const [planSubTab, setPlanSubTab] = useState('pre') // 'pre' | 'post'
  const [resultForm, setResultForm] = useState(defaultResultForm)
  const [addingResultFor, setAddingResultFor] = useState(null)
  const [evaluating, setEvaluating] = useState({})
  const [evaluation, setEvaluation] = useState({}) // { competitionId: text }
  const [planTab, setPlanTab] = useState({}) // { competitionId: 'pre' | 'post' }
  const [histEvent, setHistEvent] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [planErrors, setPlanErrors] = useState({})

  const fetchAll = async () => {
    const [compRes, pbsRes, goalsRes] = await Promise.all([
      supabase.from('competitions').select('*').eq('user_id', user.id).order('start_date', { ascending: true }),
      supabase.from('personal_bests').select('*').eq('user_id', user.id),
      supabase.from('goals').select('*').eq('user_id', user.id),
    ])
    const comps = compRes.data || []
    setCompetitions(comps)
    // 가장 가까운 예정 시합 자동 선택
    const next = comps.find(c => daysUntil(c.start_date) >= 0) || comps[comps.length - 1]
    if (next) setSelectedCompId(next.id)
    setPbs(pbsRes.data || [])
    const gm = {}
    goalsRes.data?.forEach((g) => { gm[g.event] = g })
    setGoalsMap(gm)

    // fetch results for all competitions
    const compIds = compRes.data?.map((c) => c.id) || []
    if (compIds.length > 0) {
      const { data: resData } = await supabase
        .from('competition_results')
        .select('*')
        .eq('user_id', user.id)
        .in('competition_id', compIds)
        .order('created_at', { ascending: true })
      const rm = {}
      resData?.forEach((r) => {
        if (!rm[r.competition_id]) rm[r.competition_id] = []
        rm[r.competition_id].push(r)
      })
      setResults(rm)

      // load saved evaluations
      const ev = {}
      resData?.forEach((r) => {
        if (r.ai_evaluation && !ev[r.competition_id]) ev[r.competition_id] = r.ai_evaluation
      })
      setEvaluation(ev)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const toggleEvent = (ev) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }))
  }

  const resetForm = () => {
    setForm(defaultForm)
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (competition) => {
    setForm({
      name: competition.name || '',
      start_date: competition.start_date || '',
      end_date: competition.end_date || '',
      location: competition.location || '',
      pool_type: competition.pool_type || '50m',
      events: Array.isArray(competition.events) ? competition.events : [],
      notes: competition.notes || '',
    })
    setEditingId(competition.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form, user_id: user.id }
    if (editingId) {
      await supabase.from('competitions').update(payload).eq('id', editingId)
    } else {
      await supabase.from('competitions').insert(payload)
    }
    resetForm()
    fetchAll()
  }

  const handleDelete = async (id) => {
    if (!confirm('이 시합 일정을 삭제할까요?')) return
    await supabase.from('competitions').delete().eq('id', id)
    setCompetitions((c) => c.filter((x) => x.id !== id))
  }

  // pbs 종목별 최신 1개로 중복 제거
  const latestPbs = Object.values(
    pbs.reduce((acc, p) => {
      if (!acc[p.event] || p.achieved_date > acc[p.event].achieved_date) acc[p.event] = p
      return acc
    }, {})
  )

  const generatePlan = async (competition, type) => {
    const key = `${competition.id}-${type}`
    setPlanErrors((current) => ({ ...current, [key]: '' }))
    setGenerating((g) => ({ ...g, [key]: true }))
    try {
      const text = type === 'pre'
        ? await getCompetitionPrePlan(competition, latestPbs, profile)
        : await getCompetitionPostPlan(competition, latestPbs, profile)
      const field = type === 'pre' ? 'pre_plan' : 'post_plan'
      const { error: saveError } = await supabase.from('competitions').update({ [field]: text }).eq('id', competition.id)
      if (saveError) throw new Error(`생성된 플랜 저장 실패: ${saveError.message}`)
      setCompetitions((cs) => cs.map((c) => c.id === competition.id ? { ...c, [field]: text } : c))
      setPlanTab((t) => ({ ...t, [competition.id]: type }))
    } catch (e) {
      setPlanErrors((current) => ({
        ...current,
        [key]: e.message || '플랜 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      }))
    } finally {
      setGenerating((g) => ({ ...g, [key]: false }))
    }
  }

  const handleAddResult = async (e, competitionId, competitionEvents) => {
    e.preventDefault()
    const payload = {
      user_id: user.id,
      competition_id: competitionId,
      event: resultForm.event || competitionEvents?.[0] || '',
      record_time: resultForm.record_time || null,
      rank: resultForm.rank ? parseInt(resultForm.rank) : null,
      heat: resultForm.heat || null,
      notes: resultForm.notes || null,
    }
    const { data } = await supabase.from('competition_results').insert(payload).select().single()
    setResults((r) => ({ ...r, [competitionId]: [...(r[competitionId] || []), data] }))
    setResultForm(defaultResultForm)
    setAddingResultFor(null)
  }

  const handleDeleteResult = async (resultId, competitionId) => {
    await supabase.from('competition_results').delete().eq('id', resultId)
    setResults((r) => ({ ...r, [competitionId]: r[competitionId].filter((x) => x.id !== resultId) }))
  }

  const runEvaluation = async (competition) => {
    const cid = competition.id
    setEvaluating((e) => ({ ...e, [cid]: true }))
    try {
      const compResults = results[cid] || []
      const text = await getCompetitionEvaluation(competition, compResults, latestPbs, goalsMap, profile)
      // save to first result row
      if (compResults[0]) {
        await supabase.from('competition_results').update({ ai_evaluation: text }).eq('id', compResults[0].id)
      }
      setEvaluation((e) => ({ ...e, [cid]: text }))
    } catch (e) {
      alert(e.message || '평가 생성 중 오류가 발생했습니다.')
    } finally {
      setEvaluating((e) => ({ ...e, [cid]: false }))
    }
  }

  const upcoming = competitions.filter((c) => daysUntil(c.start_date) >= 0)
  const past = competitions.filter((c) => daysUntil(c.start_date) < 0)

  const PlanSection = ({ c }) => (
    <div className="mt-4 border-t border-slate-700/30 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <BrainCircuit size={13} className="text-purple-400" />
        <span className="text-xs font-semibold text-slate-300">AI 훈련 플랜</span>
      </div>
      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={() => generatePlan(c, 'pre')}
          disabled={generating[`${c.id}-pre`]}
          className="flex items-center gap-1.5 text-xs bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
        >
          {generating[`${c.id}-pre`] ? <RefreshCw size={11} className="animate-spin" /> : <BrainCircuit size={11} />}
          {c.pre_plan ? '전훈 플랜 재생성' : '시합 전 2주 플랜 생성'}
        </button>
        <button
          onClick={() => generatePlan(c, 'post')}
          disabled={generating[`${c.id}-post`]}
          className="flex items-center gap-1.5 text-xs bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/30 text-slate-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
        >
          {generating[`${c.id}-post`] ? <RefreshCw size={11} className="animate-spin" /> : <BrainCircuit size={11} />}
          {c.post_plan ? '후훈 플랜 재생성' : '시합 후 1주 플랜 생성'}
        </button>
      </div>
      {(planErrors[`${c.id}-pre`] || planErrors[`${c.id}-post`]) && (
        <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <p className="text-xs leading-relaxed text-red-300">
            {planErrors[`${c.id}-pre`] || planErrors[`${c.id}-post`]}
          </p>
        </div>
      )}
      {(c.pre_plan || c.post_plan) && (
        <div>
          <div className="flex gap-1 mb-2">
            {c.pre_plan && (
              <button
                onClick={() => setPlanTab((t) => ({ ...t, [c.id]: 'pre' }))}
                className={`text-xs px-3 py-1 rounded-md transition ${(planTab[c.id] ?? 'pre') === 'pre' ? 'bg-purple-600/30 text-purple-300' : 'text-slate-500 hover:text-slate-300'}`}
              >시합 전 2주</button>
            )}
            {c.post_plan && (
              <button
                onClick={() => setPlanTab((t) => ({ ...t, [c.id]: 'post' }))}
                className={`text-xs px-3 py-1 rounded-md transition ${planTab[c.id] === 'post' ? 'bg-slate-600/40 text-slate-300' : 'text-slate-500 hover:text-slate-300'}`}
              >시합 후 1주</button>
            )}
          </div>
          <div className="bg-[#0f1117] rounded-lg p-3 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
            {(planTab[c.id] ?? 'pre') === 'pre' ? c.pre_plan : c.post_plan}
          </div>
        </div>
      )}
    </div>
  )

  const ResultSection = ({ c }) => {
    const compResults = results[c.id] || []
    const isAdding = addingResultFor === c.id
    const evalText = evaluation[c.id]

    return (
      <div className="mt-4 border-t border-slate-700/30 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={13} className="text-green-400" />
            <span className="text-xs font-semibold text-slate-300">시합 결과</span>
          </div>
          <button
            onClick={() => { setAddingResultFor(isAdding ? null : c.id); setResultForm({ ...defaultResultForm, event: c.events?.[0] || '' }) }}
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            {isAdding ? '취소' : '+ 결과 입력'}
          </button>
        </div>

        {compResults.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {compResults.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-[#0f1117] rounded-lg px-3 py-2">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400 w-28 shrink-0">{r.event}</span>
                  <span className="text-white font-semibold">{r.record_time ?? '-'}</span>
                  {r.rank && <span className="text-yellow-400">{r.rank}위</span>}
                  {r.heat && <span className="text-slate-500">{r.heat}</span>}
                  {r.notes && <span className="text-slate-500">{r.notes}</span>}
                </div>
                <button onClick={() => handleDeleteResult(r.id, c.id)} className="text-red-500/50 hover:text-red-400 text-xs">삭제</button>
              </div>
            ))}
          </div>
        )}

        {isAdding && (
          <form onSubmit={(e) => handleAddResult(e, c.id, c.events)} className="bg-[#0f1117] rounded-lg p-3 mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">종목</label>
                <select
                  value={resultForm.event}
                  onChange={(e) => setResultForm((f) => ({ ...f, event: e.target.value }))}
                  className="w-full bg-[#1a1d27] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none"
                  required
                >
                  <option value="">선택</option>
                  {(c.events?.length ? c.events : EVENT_OPTIONS).map((ev) => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">기록</label>
                <TimeInput
                  value={resultForm.record_time}
                  onChange={(v) => setResultForm((f) => ({ ...f, record_time: v }))}
                  placeholder="숫자만 예: 152126"
                  className="w-full bg-[#1a1d27] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">순위</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={resultForm.rank}
                  onChange={(e) => setResultForm((f) => ({ ...f, rank: e.target.value.replace(/\D/g, '') }))}
                  placeholder="예: 3 또는 12"
                  className="w-full bg-[#1a1d27] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">구분</label>
                <select
                  value={resultForm.heat}
                  onChange={(e) => setResultForm((f) => ({ ...f, heat: e.target.value }))}
                  className="w-full bg-[#1a1d27] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none"
                >
                  <option value="">선택 안함</option>
                  <option value="예선">예선</option>
                  <option value="준결승">준결승</option>
                  <option value="결승">결승</option>
                  <option value="결선">결선</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">메모</label>
                <textarea
                  value={resultForm.notes}
                  onChange={(e) => setResultForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="예: 전반 페이스 좋았음, 턴 개선 필요"
                  rows={2}
                  className="w-full bg-[#1a1d27] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none resize-none"
                />
              </div>
            </div>
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-1.5 rounded transition">저장</button>
          </form>
        )}

        {compResults.length > 0 && (
          <div className="mt-3 border-t border-slate-700/30 pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BrainCircuit size={12} className="text-purple-400" />
                <span className="text-xs font-semibold text-slate-300">AI 사후 평가</span>
              </div>
              <button
                onClick={() => runEvaluation(c)}
                disabled={evaluating[c.id]}
                className="flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 transition disabled:opacity-50"
              >
                {evaluating[c.id] ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                {evalText ? '재평가' : '평가 생성'}
              </button>
            </div>
            {evalText && (
              <div className="bg-[#0f1117] rounded-lg p-3 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                {evalText}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const selectedComp = competitions.find(c => c.id === selectedCompId)

  useEffect(() => {
    if (!selectedComp) return
    const ended = daysUntil(selectedComp.end_date || selectedComp.start_date) < 0
    setPlanSubTab(ended ? 'post' : 'pre')
  }, [selectedCompId])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">시합 일정</h1>
          <p className="text-slate-400 text-sm mt-0.5">대회 일정 및 출전 종목 관리</p>
        </div>
        {pageTab === 'schedule' && (
          <button
            onClick={() => {
              if (showForm) resetForm()
              else setShowForm(true)
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            <Plus size={16} />
            시합 등록
          </button>
        )}
      </div>

      {/* 페이지 탭 */}
      <div className="flex gap-1 mb-6 bg-[#1a1d27] p-1 rounded-lg border border-slate-700/50 w-fit">
        <button
          onClick={() => setPageTab('schedule')}
          className={`text-sm px-4 py-2 rounded-md transition font-medium ${pageTab === 'schedule' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          시합 일정
        </button>
        <button
          onClick={() => setPageTab('plan')}
          className={`text-sm px-4 py-2 rounded-md transition font-medium ${pageTab === 'plan' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          훈련 플랜
        </button>
        <button
          onClick={() => setPageTab('peak')}
          className={`text-sm px-4 py-2 rounded-md transition font-medium ${pageTab === 'peak' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          피크 타이밍
        </button>
        <button
          onClick={() => setPageTab('history')}
          className={`text-sm px-4 py-2 rounded-md transition font-medium ${pageTab === 'history' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          대회 히스토리
        </button>
      </div>

      {/* 훈련 플랜 탭 */}
      {pageTab === 'plan' && (
        <div>
          {competitions.length === 0 ? (
            <div className="bg-[#1a1d27] rounded-xl p-6 border border-slate-700/50 text-slate-500 text-sm">
              먼저 시합 일정을 등록해주세요.
            </div>
          ) : (
            <>
              {/* 시합 선택 */}
              <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 mb-4">
                <label className="block text-xs text-slate-500 mb-2">시합 선택</label>
                <select
                  value={selectedCompId || ''}
                  onChange={(e) => setSelectedCompId(e.target.value)}
                  className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  {competitions.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.start_date}) {daysUntil(c.start_date) >= 0 ? `D-${daysUntil(c.start_date)}` : '종료'}
                    </option>
                  ))}
                </select>
              </div>

              {selectedComp && (
                <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
                  {/* 시합 정보 */}
                  <div className="px-5 py-4 border-b border-slate-700/30">
                    <p className="text-white font-semibold">{selectedComp.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>{selectedComp.start_date}{selectedComp.end_date && ` ~ ${selectedComp.end_date}`}</span>
                      {selectedComp.location && <span>{selectedComp.location}</span>}
                      <span>{selectedComp.pool_type}</span>
                    </div>
                    {selectedComp.events?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedComp.events.map(ev => (
                          <span key={ev} className="text-xs bg-blue-600/20 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full">{ev}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 플랜 서브 탭 */}
                  <div className="flex gap-1 px-5 pt-4 pb-2">
                    <button
                      onClick={() => setPlanSubTab('pre')}
                      className={`text-xs px-4 py-1.5 rounded-md transition font-medium ${planSubTab === 'pre' ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      시합 전 2주 플랜
                    </button>
                    <button
                      onClick={() => setPlanSubTab('post')}
                      className={`text-xs px-4 py-1.5 rounded-md transition font-medium ${planSubTab === 'post' ? 'bg-slate-600/40 text-slate-300 border border-slate-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      시합 후 1주 플랜
                    </button>
                  </div>

                  <div className="px-5 pb-5">
                    <button
                      onClick={() => generatePlan(selectedComp, planSubTab)}
                      disabled={generating[`${selectedComp.id}-${planSubTab}`]}
                      className="flex items-center gap-1.5 text-xs bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50 mb-3"
                    >
                      {generating[`${selectedComp.id}-${planSubTab}`]
                        ? <RefreshCw size={11} className="animate-spin" />
                        : <BrainCircuit size={11} />}
                      {planSubTab === 'pre'
                        ? (selectedComp.pre_plan ? '전훈 플랜 재생성' : '시합 전 2주 플랜 생성')
                        : (selectedComp.post_plan ? '후훈 플랜 재생성' : '시합 후 1주 플랜 생성')}
                    </button>
                    {planErrors[`${selectedComp.id}-${planSubTab}`] && (
                      <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                        <p className="text-xs leading-relaxed text-red-300">
                          {planErrors[`${selectedComp.id}-${planSubTab}`]}
                        </p>
                      </div>
                    )}
                    {planSubTab === 'pre' && selectedComp.pre_plan && (
                      <div className="bg-[#0f1117] rounded-lg p-4 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {selectedComp.pre_plan}
                      </div>
                    )}
                    {planSubTab === 'post' && selectedComp.post_plan && (
                      <div className="bg-[#0f1117] rounded-lg p-4 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {selectedComp.post_plan}
                      </div>
                    )}
                    {planSubTab === 'pre' && !selectedComp.pre_plan && (
                      <p className="text-slate-600 text-xs">버튼을 눌러 시합 전 2주 훈련 플랜을 생성하세요.</p>
                    )}
                    {planSubTab === 'post' && !selectedComp.post_plan && (
                      <p className="text-slate-600 text-xs">버튼을 눌러 시합 후 1주 회복 플랜을 생성하세요.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 피크 타이밍 플래너 */}
      {pageTab === 'peak' && (() => {
        const PHASES = [
          { label: '기초 훈련', dFrom: 84, dTo: 56, color: 'bg-slate-500', desc: '볼륨 최대화, 유산소 기반 구축', volume: '100%' },
          { label: '피크 볼륨', dFrom: 56, dTo: 35, color: 'bg-blue-500', desc: '고강도 인터벌, 최대 볼륨 유지', volume: '100%' },
          { label: '강도 전환', dFrom: 35, dTo: 21, color: 'bg-purple-500', desc: '레이스 페이스 훈련 증가, 볼륨 유지', volume: '90%' },
          { label: '테이퍼 시작', dFrom: 21, dTo: 14, color: 'bg-yellow-500', desc: '볼륨 20% 감소, 강도 유지', volume: '80%' },
          { label: '테이퍼', dFrom: 14, dTo: 7, color: 'bg-orange-500', desc: '볼륨 50% 감소, 레이스 페이스 집중', volume: '50%' },
          { label: '레이스 준비', dFrom: 7, dTo: 1, color: 'bg-red-500', desc: '가벼운 활성화 수영, 충분한 휴식', volume: '30%' },
          { label: '시합 당일', dFrom: 0, dTo: 0, color: 'bg-green-500', desc: '워밍업 루틴 준수', volume: '-' },
        ]

        const today = new Date()

        return (
          <div>
            {competitions.length === 0 ? (
              <div className="bg-[#1a1d27] rounded-xl p-6 border border-slate-700/50 text-slate-500 text-sm">
                먼저 시합 일정을 등록해주세요.
              </div>
            ) : (
              <>
                <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 mb-4">
                  <label className="block text-xs text-slate-500 mb-2">시합 선택</label>
                  <select value={selectedCompId || ''} onChange={(e) => setSelectedCompId(e.target.value)}
                    className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500">
                    {competitions.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.start_date}) {daysUntil(c.start_date) >= 0 ? `D-${daysUntil(c.start_date)}` : '종료'}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedComp && (() => {
                  const raceDate = new Date(selectedComp.start_date)
                  const dLeft = Math.ceil((raceDate - today) / (1000 * 60 * 60 * 24))

                  return (
                    <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-700/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white font-semibold">{selectedComp.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{selectedComp.start_date}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-bold ${dLeft > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                              {dLeft > 0 ? `D-${dLeft}` : '종료'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-5 space-y-3">
                        {PHASES.map((phase) => {
                          const phaseStart = new Date(raceDate)
                          phaseStart.setDate(phaseStart.getDate() - phase.dFrom)
                          const phaseEnd = new Date(raceDate)
                          phaseEnd.setDate(phaseEnd.getDate() - phase.dTo)
                          const isActive = today >= phaseStart && today <= phaseEnd
                          const isPast = today > phaseEnd
                          const isFuture = today < phaseStart

                          return (
                            <div key={phase.label}
                              className={`flex items-start gap-4 p-3 rounded-xl transition ${isActive ? 'bg-green-500/10 border border-green-500/30' : isPast ? 'opacity-40' : 'bg-slate-800/30'}`}>
                              <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${phase.color}`} />
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <p className={`text-sm font-semibold ${isActive ? 'text-green-300' : isPast ? 'text-slate-500' : 'text-white'}`}>
                                      {phase.label}
                                      {isActive && <span className="ml-2 text-xs text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded-full">현재</span>}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-slate-500">
                                    <span>볼륨 <span className="text-slate-300">{phase.volume}</span></span>
                                    <span>{phase.dFrom === 0 ? selectedComp.start_date : `D-${phase.dFrom} ~ D-${phase.dTo}`}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">{phase.desc}</p>
                                {phase.dFrom > 0 && (
                                  <p className="text-xs text-slate-600 mt-0.5">
                                    {phaseStart.toISOString().slice(0,10)} ~ {phaseEnd.toISOString().slice(0,10)}
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {dLeft > 0 && (
                        <div className="px-5 pb-5">
                          <div className="bg-[#0f1117] rounded-xl p-4 border border-slate-700/30">
                            <p className="text-xs text-slate-400 mb-2 font-semibold">테이퍼 시작까지</p>
                            <p className="text-sm text-white">
                              {dLeft > 21
                                ? `${dLeft - 21}일 후 테이퍼 시작 (D-21). 지금은 ${dLeft > 56 ? '기초 훈련' : dLeft > 35 ? '피크 볼륨' : '강도 전환'} 단계.`
                                : dLeft > 14 ? `테이퍼 시작! 볼륨을 80%로 줄이고 강도를 유지하세요.`
                                : dLeft > 7 ? `테이퍼 진행 중. 볼륨 50%, 레이스 페이스에 집중하세요.`
                                : `레이스 준비 단계. 몸을 가볍게 유지하고 충분히 쉬세요.`}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        )
      })()}

      {/* 대회 히스토리 비교 */}
      {pageTab === 'history' && (() => {
        // 모든 결과에서 종목 추출
        const allResults = Object.values(results).flat()
        const eventSet = [...new Set(allResults.map(r => r.event))].sort()

        // competition id → name/date 맵
        const compMap = {}
        competitions.forEach(c => { compMap[c.id] = c })

        const activeHistEvent = histEvent || eventSet[0] || ''

        const histData = allResults
          .filter(r => r.event === activeHistEvent && r.record_time)
          .map(r => ({
            name: compMap[r.competition_id]?.name?.slice(0, 8) || '-',
            date: compMap[r.competition_id]?.start_date || '',
            기록초: Math.round(timeToSeconds(r.record_time) * 100) / 100,
            기록: r.record_time,
            rank: r.rank,
          }))
          .sort((a, b) => a.date.localeCompare(b.date))

        const best = histData.length ? histData.reduce((a, b) => a.기록초 < b.기록초 ? a : b) : null

        return (
          <div>
            {allResults.length === 0 ? (
              <div className="bg-[#1a1d27] rounded-xl p-6 border border-slate-700/50 text-slate-500 text-sm">
                시합 결과를 입력하면 여기서 비교할 수 있습니다.
              </div>
            ) : (
              <>
                {/* 종목 선택 */}
                <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 mb-4">
                  <label className="block text-xs text-slate-500 mb-2">종목 선택</label>
                  <div className="flex flex-wrap gap-2">
                    {eventSet.map(ev => (
                      <button key={ev} onClick={() => setHistEvent(ev)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition ${activeHistEvent === ev ? 'bg-orange-600/30 border-orange-500/40 text-orange-300' : 'border-slate-700 text-slate-500 hover:text-white'}`}>
                        {ev}
                      </button>
                    ))}
                  </div>
                </div>

                {histData.length === 0 ? (
                  <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 text-slate-500 text-sm">
                    선택한 종목의 결과가 없습니다.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* 베스트 기록 */}
                    {best && (
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-400 mb-1">최고 기록</p>
                          <p className="text-2xl font-bold text-yellow-400 font-mono">{best.기록}</p>
                          <p className="text-xs text-slate-500 mt-1">{best.name} ({best.date}){best.rank ? ` · ${best.rank}위` : ''}</p>
                        </div>
                        <span className="text-3xl">🏆</span>
                      </div>
                    )}

                    {/* 기록 추이 그래프 */}
                    {histData.length >= 2 && (
                      <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
                        <h2 className="text-sm font-semibold text-slate-300 mb-4">{activeHistEvent} 대회별 기록 추이</h2>
                        <MeasuredChart height={200}>
                          <LineChart data={histData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                            <YAxis
                              domain={['auto', 'auto']}
                              tick={{ fill: '#64748b', fontSize: 10 }}
                              tickFormatter={(v) => { const m = Math.floor(v/60); const s = (v%60).toFixed(0).padStart(2,'0'); return m > 0 ? `${m}:${s}` : `${s}` }}
                              reversed
                            />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#1a1d27', border: '1px solid #334155', borderRadius: 8 }}
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null
                                const d = payload[0].payload
                                return (
                                  <div style={{ backgroundColor: '#1a1d27', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
                                    <p style={{ color: '#94a3b8', marginBottom: 2 }}>{d.name} ({d.date})</p>
                                    <p style={{ color: '#f97316', fontWeight: 600 }}>{d.기록}</p>
                                    {d.rank && <p style={{ color: '#facc15' }}>{d.rank}위</p>}
                                  </div>
                                )
                              }}
                            />
                            <Line type="monotone" dataKey="기록초" stroke="#f97316" strokeWidth={2}
                              dot={({ cx, cy, payload }) => {
                                const isBest = payload.기록초 === best?.기록초
                                return <circle key={cx} cx={cx} cy={cy} r={isBest ? 7 : 4} fill={isBest ? '#facc15' : '#f97316'} stroke="#1a1d27" strokeWidth={2} />
                              }}
                            />
                          </LineChart>
                        </MeasuredChart>
                      </div>
                    )}

                    {/* 기록 테이블 */}
                    <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-700/30">
                            <th className="text-left px-5 py-3 font-medium">대회</th>
                            <th className="text-left px-4 py-3 font-medium">날짜</th>
                            <th className="text-right px-4 py-3 font-medium">기록</th>
                            <th className="text-right px-5 py-3 font-medium">순위</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...histData].reverse().map((row, i) => (
                            <tr key={i} className={`border-b border-slate-700/20 last:border-0 ${row.기록 === best?.기록 ? 'bg-yellow-500/5' : 'hover:bg-slate-700/10'}`}>
                              <td className="px-5 py-3">
                                <span className="text-slate-300">{compMap[allResults.find(r => r.event === histEvent && r.record_time === row.기록)?.competition_id]?.name || row.name}</span>
                                {row.기록 === best?.기록 && <span className="ml-2 text-xs text-yellow-400">🏆 베스트</span>}
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{row.date}</td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-white">{row.기록}</td>
                              <td className="px-5 py-3 text-right text-yellow-400">{row.rank ? `${row.rank}위` : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}

      {pageTab === 'plan' && <div className="hidden" />}
      {pageTab !== 'plan' && pageTab !== 'peak' && pageTab !== 'history' && <div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">{editingId ? '시합 일정 수정' : '시합 정보 입력'}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1">대회명</label>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="예: 2026 전국체전"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">시작일</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">종료일 (선택)</label>
              <input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">장소</label>
              <input type="text" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="예: 광주 염주체육관"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">풀 사이즈</label>
              <select value={form.pool_type} onChange={(e) => setForm((f) => ({ ...f, pool_type: e.target.value }))}
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="50m">50m (장수)</option>
                <option value="25m">25m (단수)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">출전 종목 (복수 선택)</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_OPTIONS.map((ev) => (
                <button key={ev} type="button" onClick={() => toggleEvent(ev)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${form.events.includes(ev) ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'bg-transparent border-slate-700 text-slate-500 hover:border-slate-500'}`}>
                  {ev}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">메모 (선택)</label>
            <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="예: A기준 도전, 국가대표 선발전"
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">{editingId ? '수정 완료' : '저장'}</button>
            <button type="button" onClick={resetForm} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-5 py-2 rounded-lg transition">취소</button>
          </div>
        </form>
      )}

      {/* 예정 시합 */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">예정된 시합</h2>
        {upcoming.length === 0 ? (
          <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 text-slate-500 text-sm">
            등록된 예정 시합이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((c) => {
              const days = daysUntil(c.start_date)
              const isOpen = expanded === c.id
              return (
                <div key={c.id} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
                  <button onClick={() => setExpanded(isOpen ? null : c.id)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-700/20 transition">
                    <div className="flex items-center gap-4">
                      <div className="text-center w-12">
                        <p className="text-blue-400 font-bold text-lg leading-none">{days}</p>
                        <p className="text-slate-500 text-xs">일 후</p>
                      </div>
                      <div className="text-left">
                        <p className="text-white font-semibold text-sm">{c.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-slate-500 text-xs flex items-center gap-1">
                            <CalendarDays size={11} />{c.start_date}{c.end_date && ` ~ ${c.end_date}`}
                          </span>
                          {c.location && <span className="text-slate-500 text-xs flex items-center gap-1"><MapPin size={11} />{c.location}</span>}
                          <span className="text-slate-500 text-xs flex items-center gap-1"><Waves size={11} />{c.pool_type}</span>
                        </div>
                      </div>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 border-t border-slate-700/30">
                      {c.events?.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-slate-500 mb-2">출전 종목</p>
                          <div className="flex flex-wrap gap-2">
                            {c.events.map((ev) => (
                              <span key={ev} className="text-xs bg-blue-600/20 border border-blue-500/30 text-blue-300 px-2.5 py-1 rounded-full">{ev}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {c.notes && <p className="text-xs text-slate-400 mt-3">{c.notes}</p>}
                      <PlanSection c={c} />
                      <div className="mt-4 flex gap-3">
                        <button onClick={() => handleEdit(c)} className="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1">
                          <Pencil size={11} /> 수정
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="text-xs text-red-500/60 hover:text-red-400 transition flex items-center gap-1">
                          <Trash2 size={11} /> 삭제
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 지난 시합 */}
      {past.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">지난 시합</h2>
          <div className="space-y-2">
            {[...past].reverse().map((c) => {
              const isOpen = expanded === c.id
              const compResults = results[c.id] || []
              return (
                <div key={c.id} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
                  <button onClick={() => setExpanded(isOpen ? null : c.id)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-700/20 transition">
                    <div className="flex items-center gap-4">
                      <div className="text-left">
                        <p className="text-slate-300 font-medium text-sm">{c.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-slate-500 text-xs">{c.start_date}</span>
                          {compResults.length > 0 && (
                            <span className="text-xs bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">결과 {compResults.length}건</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 border-t border-slate-700/30">
                      {c.events?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {c.events.map((ev) => (
                            <span key={ev} className="text-xs bg-slate-700/40 border border-slate-600/30 text-slate-400 px-2.5 py-1 rounded-full">{ev}</span>
                          ))}
                        </div>
                      )}
                      {c.notes && <p className="text-xs text-slate-500 mt-2">{c.notes}</p>}
                      <ResultSection c={c} />
                      <div className="mt-4 flex gap-3">
                        <button onClick={() => handleEdit(c)} className="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1">
                          <Pencil size={11} /> 수정
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="text-xs text-red-500/60 hover:text-red-400 transition flex items-center gap-1">
                          <Trash2 size={11} /> 삭제
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      </div>}
    </div>
  )
}
