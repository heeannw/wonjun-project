import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { getCompetitionPrePlan, getCompetitionPostPlan, getCompetitionEvaluation } from '../lib/gemini'
import { Plus, CalendarDays, MapPin, Waves, ChevronDown, ChevronUp, Trash2, BrainCircuit, RefreshCw, ClipboardList } from 'lucide-react'

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
  const [competitions, setCompetitions] = useState([])
  const [pbs, setPbs] = useState([])
  const [goalsMap, setGoalsMap] = useState({})
  const [results, setResults] = useState({}) // { competitionId: [result, ...] }
  const [form, setForm] = useState(defaultForm)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [generating, setGenerating] = useState({})
  const [planTab, setPlanTab] = useState({})
  const [resultForm, setResultForm] = useState(defaultResultForm)
  const [addingResultFor, setAddingResultFor] = useState(null)
  const [evaluating, setEvaluating] = useState({})
  const [evaluation, setEvaluation] = useState({}) // { competitionId: text }

  const fetchAll = async () => {
    const [compRes, pbsRes, goalsRes] = await Promise.all([
      supabase.from('competitions').select('*').eq('user_id', user.id).order('start_date', { ascending: true }),
      supabase.from('personal_bests').select('*').eq('user_id', user.id),
      supabase.from('goals').select('*').eq('user_id', user.id),
    ])
    setCompetitions(compRes.data || [])
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    await supabase.from('competitions').insert({ ...form, user_id: user.id })
    setForm(defaultForm)
    setShowForm(false)
    fetchAll()
  }

  const handleDelete = async (id) => {
    if (!confirm('이 시합 일정을 삭제할까요?')) return
    await supabase.from('competitions').delete().eq('id', id)
    setCompetitions((c) => c.filter((x) => x.id !== id))
  }

  const generatePlan = async (competition, type) => {
    const key = `${competition.id}-${type}`
    setGenerating((g) => ({ ...g, [key]: true }))
    try {
      const text = type === 'pre'
        ? await getCompetitionPrePlan(competition, pbs)
        : await getCompetitionPostPlan(competition, pbs)
      const field = type === 'pre' ? 'pre_plan' : 'post_plan'
      await supabase.from('competitions').update({ [field]: text }).eq('id', competition.id)
      setCompetitions((cs) => cs.map((c) => c.id === competition.id ? { ...c, [field]: text } : c))
      setPlanTab((t) => ({ ...t, [competition.id]: type }))
    } catch {
      alert('플랜 생성 중 오류가 발생했습니다.')
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
      const text = await getCompetitionEvaluation(competition, compResults, pbs, goalsMap)
      // save to first result row
      if (compResults[0]) {
        await supabase.from('competition_results').update({ ai_evaluation: text }).eq('id', compResults[0].id)
      }
      setEvaluation((e) => ({ ...e, [cid]: text }))
    } catch {
      alert('평가 생성 중 오류가 발생했습니다.')
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
                <input
                  type="text"
                  value={resultForm.record_time}
                  onChange={(e) => setResultForm((f) => ({ ...f, record_time: e.target.value }))}
                  placeholder="예: 15:21.26"
                  className="w-full bg-[#1a1d27] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">순위</label>
                <input
                  type="number"
                  value={resultForm.rank}
                  onChange={(e) => setResultForm((f) => ({ ...f, rank: e.target.value }))}
                  placeholder="예: 3"
                  className="w-full bg-[#1a1d27] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">라운드</label>
                <input
                  type="text"
                  value={resultForm.heat}
                  onChange={(e) => setResultForm((f) => ({ ...f, heat: e.target.value }))}
                  placeholder="예: 예선 / 결선"
                  className="w-full bg-[#1a1d27] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">메모</label>
                <input
                  type="text"
                  value={resultForm.notes}
                  onChange={(e) => setResultForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="예: 전반 페이스 좋았음"
                  className="w-full bg-[#1a1d27] border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none"
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">시합 일정</h1>
          <p className="text-slate-400 text-sm mt-0.5">대회 일정 및 출전 종목 관리</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          시합 등록
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">시합 정보 입력</h2>
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
              <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
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
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">저장</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-5 py-2 rounded-lg transition">취소</button>
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
                      <button onClick={() => handleDelete(c.id)} className="mt-4 text-xs text-red-500/60 hover:text-red-400 transition flex items-center gap-1">
                        <Trash2 size={11} /> 삭제
                      </button>
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
                      <button onClick={() => handleDelete(c.id)} className="mt-4 text-xs text-red-500/60 hover:text-red-400 transition flex items-center gap-1">
                        <Trash2 size={11} /> 삭제
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
