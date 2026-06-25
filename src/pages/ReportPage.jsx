import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { calcFinaPoints, timeToSeconds } from '../lib/fina'
import { getMonthlyReportAnalysis } from '../lib/gemini'
import { useProfileStore } from '../store/profileStore'
import { Printer, BrainCircuit, RefreshCw, ChevronLeft, ChevronRight, Trophy } from 'lucide-react'
import { formatPaceSeconds } from '../lib/pace'

function getMonthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  return { start, end }
}

function formatSeconds(value) {
  return `${Math.abs(value).toFixed(2)}초`
}

function parseReportSections(text) {
  if (!text) return []
  const normalized = text.replace(/\r\n/g, '\n').trim()
  const matches = [...normalized.matchAll(/(?:^|\n)\s*(\d+)\.\s+([^\n]+)\n/g)]
  if (!matches.length) return [{ title: 'AI 종합 분석', body: normalized }]

  return matches.map((match, index) => {
    const next = matches[index + 1]
    const start = match.index + match[0].length
    const end = next ? next.index : normalized.length
    return {
      number: match[1],
      title: match[2].trim(),
      body: normalized.slice(start, end).trim(),
    }
  }).filter((section) => section.body)
}

function ReportSectionCard({ section }) {
  const lines = section.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="bg-[#0f1117] print:bg-gray-50 border border-slate-700/50 print:border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {section.number && (
          <span className="w-6 h-6 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 print:text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
            {section.number}
          </span>
        )}
        <h3 className="text-sm font-bold text-white print:text-gray-900">{section.title}</h3>
      </div>
      <div className="space-y-2">
        {lines.map((line, index) => {
          const cleaned = line.replace(/^\d+\.\s*/, '').replace(/^[-•]\s*/, '')
          const isDirection = section.title.includes('방향')
          return (
            <p
              key={`${section.title}-${index}`}
              className={`text-sm leading-relaxed print:text-gray-700 ${
                isDirection
                  ? 'text-slate-200 bg-[#151923] print:bg-white border border-slate-800 print:border-gray-200 rounded-lg px-3 py-2'
                  : 'text-slate-300'
              }`}
            >
              {isDirection && <span className="text-blue-400 print:text-blue-700 font-semibold mr-1">{index + 1}.</span>}
              {cleaned}
            </p>
          )
        })}
      </div>
    </div>
  )
}

export default function ReportPage() {
  const user = useAuthStore((s) => s.user)
  const profile = useProfileStore((s) => s.profile)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [logs, setLogs] = useState([])
  const [pbs, setPbs] = useState([])
  const [mentalLogs, setMentalLogs] = useState([])
  const [bodyRecords, setBodyRecords] = useState([])
  const [competitions, setCompetitions] = useState([])
  const [competitionResults, setCompetitionResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [aiError, setAiError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setAiSummary('')
    setAiError('')
    const { start, end } = getMonthRange(year, month)
    const [logsRes, pbsRes, mentalRes, bodyRes, competitionsRes] = await Promise.all([
      supabase.from('training_logs').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date'),
      supabase.from('personal_bests').select('*').eq('user_id', user.id),
      supabase.from('mental_journals').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date'),
      supabase.from('body_records').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date'),
      supabase.from('competitions').select('*').eq('user_id', user.id).lte('start_date', end).or(`end_date.gte.${start},end_date.is.null`).order('start_date'),
    ])
    const compIds = competitionsRes.data?.map((c) => c.id) || []
    const resultsRes = compIds.length
      ? await supabase.from('competition_results').select('*').eq('user_id', user.id).in('competition_id', compIds)
      : { data: [] }
    setLogs(logsRes.data || [])
    setPbs(pbsRes.data || [])
    setMentalLogs(mentalRes.data || [])
    setBodyRecords(bodyRes.data || [])
    setCompetitions(competitionsRes.data || [])
    setCompetitionResults(resultsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [year, month])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  // 통계 계산
  const totalDist = logs.reduce((s, l) => s + (l.total_distance_m || 0), 0)
  const trainDays = logs.length
  const avgRpe = trainDays ? (logs.reduce((s, l) => s + (l.rpe || 0), 0) / trainDays).toFixed(1) : '-'
  const avgSleep = trainDays ? (logs.reduce((s, l) => s + (l.sleep_hours || 0), 0) / trainDays).toFixed(1) : '-'
  const avgCondition = trainDays ? (logs.reduce((s, l) => s + (l.condition_score || 0), 0) / trainDays).toFixed(1) : '-'
  const avgFatigue = trainDays ? (logs.reduce((s, l) => s + (l.forearm_fatigue || 0), 0) / trainDays).toFixed(1) : '-'

  // 이번 달 PB 갱신 기록
  const { start: mStart, end: mEnd } = getMonthRange(year, month)
  const monthPbs = pbs
    .filter(p => p.achieved_date >= mStart && p.achieved_date <= mEnd)
    .sort((a, b) => new Date(a.achieved_date) - new Date(b.achieved_date))
  const monthPbChanges = monthPbs.map((pb) => {
    const currentSec = timeToSeconds(pb.record_time)
    const previousBest = pbs
      .filter((record) => record.event === pb.event && record.achieved_date < pb.achieved_date)
      .reduce((best, record) => {
        if (!best) return record
        return timeToSeconds(record.record_time) < timeToSeconds(best.record_time) ? record : best
      }, null)
    if (!previousBest) return { pb, status: 'first', previousBest: null, deltaSec: null }

    const previousSec = timeToSeconds(previousBest.record_time)
    const deltaSec = currentSec - previousSec
    if (deltaSec < 0) return { pb, status: 'new-best', previousBest, deltaSec }
    if (deltaSec > 0) return { pb, status: 'behind-best', previousBest, deltaSec }
    return { pb, status: 'same-best', previousBest, deltaSec }
  })

  // 종목별 현재 PB (가장 빠른 기록)
  const latestPbMap = {}
  pbs.forEach(p => {
    if (!latestPbMap[p.event] || timeToSeconds(p.record_time) < timeToSeconds(latestPbMap[p.event].record_time)) {
      latestPbMap[p.event] = p
    }
  })
  const mainEvents = ['자유형 400m', '자유형 800m', '자유형 1500m', '개인혼영 400m', '자유형 200m', '배영 100m']
  const latestBody = bodyRecords[bodyRecords.length - 1]
  const firstBody = bodyRecords[0]
  const weightChange = latestBody && firstBody && latestBody.id !== firstBody.id
    ? (latestBody.weight - firstBody.weight).toFixed(1)
    : null
  const emotionCounts = mentalLogs.reduce((acc, log) => {
    acc[log.emotion] = (acc[log.emotion] || 0) + 1
    return acc
  }, {})
  const topEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]
  const aiReportSections = parseReportSections(aiSummary)

  const runAiSummary = async () => {
    setAnalyzing(true)
    setAiError('')
    try {
      const result = await getMonthlyReportAnalysis({
        year,
        month,
        logs,
        monthPbs,
        bodyRecords,
        mentalLogs,
        competitions,
        competitionResults,
        latestPbs: Object.values(latestPbMap),
      }, profile)
      setAiSummary(result)
    } catch (e) {
      setAiError(e.message || 'AI 결과서를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div>
      {/* 화면용 헤더 (인쇄 시 숨김) */}
      <div className="report-toolbar print:hidden mb-6 flex items-center justify-between gap-4">
        <div className="report-heading">
          <h1 className="text-xl font-bold text-white">월간 리포트</h1>
          <p className="text-slate-400 text-sm mt-0.5">월별 훈련 종합 결과서</p>
        </div>
        <div className="report-actions flex items-center gap-3">
          <div className="report-month-control flex items-center justify-between gap-2 bg-[#1a1d27] border border-slate-700/50 rounded-lg px-3 py-2">
            <button onClick={prevMonth} className="text-slate-400 hover:text-white transition"><ChevronLeft size={16} /></button>
            <span className="whitespace-nowrap text-center text-sm font-semibold text-white">{year}년 {month}월</span>
            <button onClick={nextMonth} className="text-slate-400 hover:text-white transition"><ChevronRight size={16} /></button>
          </div>
          <button
            onClick={runAiSummary}
            disabled={analyzing || trainDays === 0}
            className="report-action-button flex items-center justify-center gap-2 whitespace-nowrap bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-sm px-4 py-2 rounded-lg transition disabled:opacity-40"
          >
            {analyzing ? <RefreshCw size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
            상세 결과서 생성
          </button>
          <button
            onClick={() => window.print()}
            className="report-action-button flex items-center justify-center gap-2 whitespace-nowrap bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            <Printer size={14} />
            PDF 저장
          </button>
        </div>
      </div>
      {aiError && (
        <div className="print:hidden mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {aiError}
        </div>
      )}

      {/* 리포트 본문 */}
      <div className="report-body bg-[#1a1d27] print:bg-white rounded-xl border border-slate-700/50 print:border-0 p-8 space-y-8">

        {/* 리포트 타이틀 */}
        <div className="border-b border-slate-700/50 print:border-gray-200 pb-6">
          <p className="text-xs text-slate-500 print:text-gray-400 uppercase tracking-widest mb-1">WONJUN PROJECT</p>
          <h1 className="text-2xl font-bold text-white print:text-gray-900">{year}년 {month}월 훈련 종합 결과서</h1>
          <p className="text-slate-400 print:text-gray-500 text-sm mt-1">원준 · 자유형 장거리 · 2028 LA 올림픽</p>
        </div>

        {loading ? (
          <p className="text-slate-500 text-sm">불러오는 중...</p>
        ) : (
          <>
            {/* 훈련 통계 */}
            <div>
              <h2 className="text-sm font-bold text-slate-300 print:text-gray-700 uppercase tracking-wider mb-4">훈련 통계</h2>
              {trainDays === 0 ? (
                <p className="text-slate-500 text-sm">이번 달 훈련 기록이 없습니다.</p>
              ) : (
                <div className="report-stat-grid grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    { label: '훈련일수', value: `${trainDays}일` },
                    { label: '총 거리', value: `${(totalDist / 1000).toFixed(1)}km` },
                    { label: '평균 운동 강도', value: avgRpe },
                    { label: '평균 수면', value: `${avgSleep}h` },
                    { label: '평균 컨디션', value: `${avgCondition}/10` },
                    { label: '평균 신체 피로', value: `${avgFatigue}/10` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-[#0f1117] print:bg-gray-50 print:border print:border-gray-200 rounded-xl p-4 text-center">
                      <p className="text-xs text-slate-500 print:text-gray-500 mb-1">{label}</p>
                      <p className="text-lg font-bold text-white print:text-gray-900">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 훈련 일지 */}
            {logs.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-300 print:text-gray-700 uppercase tracking-wider mb-4">훈련 기록</h2>
                <table className="report-training-table hidden w-full text-sm md:table">
                  <thead>
                    <tr className="text-xs text-slate-500 print:text-gray-500 border-b border-slate-700/50 print:border-gray-200">
                      <th className="text-left py-2">날짜</th>
                      <th className="text-left py-2">종목</th>
                      <th className="text-right py-2">거리</th>
                      <th className="text-right py-2">운동 강도</th>
                      <th className="text-right py-2">컨디션</th>
                      <th className="text-right py-2">수면</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-b border-slate-700/20 print:border-gray-100">
                        <td className="py-1.5 text-slate-300 print:text-gray-700">{log.date}</td>
                        <td className="py-1.5 text-slate-400 print:text-gray-500 text-xs">{log.main_event || '-'}</td>
                        <td className="py-1.5 text-right text-slate-300 print:text-gray-700">{(log.total_distance_m || 0).toLocaleString()}m</td>
                        <td className="py-1.5 text-right text-slate-400 print:text-gray-500">{log.rpe}</td>
                        <td className="py-1.5 text-right text-slate-400 print:text-gray-500">{log.condition_score}</td>
                        <td className="py-1.5 text-right text-slate-400 print:text-gray-500">{log.sleep_hours}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="space-y-2 md:hidden">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-slate-700/50 bg-[#0f1117] p-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{log.date} {log.session_period || ''}</p>
                          <p className="text-xs text-slate-500">{log.main_event || '-'}</p>
                        </div>
                        <p className="text-sm font-semibold text-blue-400">{(log.total_distance_m || 0).toLocaleString()}m</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                        <div>
                          <p className="text-[10px] text-slate-600">100m 페이스</p>
                          <p className="text-xs text-blue-400">{formatPaceSeconds(log.pace_seconds)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-600">운동 강도</p>
                          <p className="text-xs text-slate-300">{log.rpe ?? '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-600">컨디션</p>
                          <p className="text-xs text-slate-300">{log.condition_score ?? '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-600">수면</p>
                          <p className="text-xs text-slate-300">{log.sleep_hours ? `${log.sleep_hours}h` : '-'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 이달 PB 변화 */}
            <div>
              <h2 className="text-sm font-bold text-slate-300 print:text-gray-700 uppercase tracking-wider mb-4">이달 PB 변화</h2>
              {monthPbs.length === 0 ? (
                <p className="text-slate-500 text-sm">이번 달 새 PB 기록은 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {monthPbChanges.map(({ pb, status, previousBest, deltaSec }) => (
                    <div
                      key={pb.id}
                      className={`rounded-lg px-4 py-3 border ${
                        status === 'new-best'
                          ? 'bg-emerald-500/10 border-emerald-500/30 print:bg-emerald-50 print:border-emerald-200'
                          : status === 'behind-best'
                            ? 'bg-slate-900/50 border-slate-700/70 print:bg-gray-50 print:border-gray-200'
                            : 'bg-yellow-500/10 border-yellow-500/25 print:bg-yellow-50 print:border-yellow-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-xs text-slate-500 print:text-gray-500 mb-1">{pb.achieved_date}</p>
                          <p className="text-sm text-slate-300 print:text-gray-700">{pb.event}</p>
                        </div>
                        {status === 'new-best' && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300 print:text-emerald-700 bg-emerald-500/10 px-2 py-1 rounded-full">
                            <Trophy size={12} />
                            신기록
                          </span>
                        )}
                        {status === 'behind-best' && (
                          <span className="text-xs font-bold text-orange-300 print:text-orange-700 bg-orange-500/10 px-2 py-1 rounded-full">
                            ▼ +{formatSeconds(deltaSec)}
                          </span>
                        )}
                      </div>
                      <p className="text-xl font-bold text-white print:text-gray-900">{pb.record_time}</p>
                      {previousBest && (
                        <p className="text-xs text-slate-500 print:text-gray-500 mt-1">
                          기존 베스트 {previousBest.record_time}
                          {status === 'new-best' && ` · ${formatSeconds(deltaSec)} 단축`}
                        </p>
                      )}
                      {!previousBest && (
                        <p className="text-xs text-slate-500 print:text-gray-500 mt-1">첫 등록 기록</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 신체 및 회복 상태 */}
            <div>
              <h2 className="text-sm font-bold text-slate-300 print:text-gray-700 uppercase tracking-wider mb-4">신체 상태와 회복</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {[
                  { label: '현재 체중', value: latestBody ? `${latestBody.weight}kg` : '-' },
                  { label: '체중 변화', value: weightChange !== null ? `${parseFloat(weightChange) > 0 ? '+' : ''}${weightChange}kg` : '-' },
                  { label: '신체 기록', value: `${bodyRecords.length}회` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[#0f1117] print:bg-gray-50 print:border print:border-gray-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-slate-500 print:text-gray-500 mb-1">{label}</p>
                    <p className="text-lg font-bold text-white print:text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 시합 및 결과 */}
            <div>
              <h2 className="text-sm font-bold text-slate-300 print:text-gray-700 uppercase tracking-wider mb-4">시합 및 결과</h2>
              {competitions.length === 0 ? (
                <p className="text-slate-500 text-sm">이번 달 시합 일정이 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {competitions.map((c) => {
                    const results = competitionResults.filter((r) => r.competition_id === c.id)
                    return (
                      <div key={c.id} className="bg-[#0f1117] print:bg-gray-50 print:border print:border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <p className="text-slate-300 print:text-gray-700 font-medium">{c.name}</p>
                        <p className="text-xs text-slate-500 print:text-gray-500">{c.start_date} ~ {c.end_date || c.start_date}</p>
                        {results.length > 0 && (
                          <p className="text-xs text-slate-400 print:text-gray-600 mt-1">
                            {results.map((r) => `${r.event} ${r.record_time || '-'}`).join(' / ')}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 현재 PB */}
            <div>
              <h2 className="text-sm font-bold text-slate-300 print:text-gray-700 uppercase tracking-wider mb-4">현재 PB 기록</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mainEvents.map(ev => {
                  const pb = latestPbMap[ev]
                  const fina = pb ? calcFinaPoints(ev, pb.record_time) : null
                  const isMonthPb = monthPbs.some(p => p.event === ev && p.id === pb?.id)
                  return (
                    <div key={ev} className="bg-[#0f1117] print:bg-gray-50 print:border print:border-gray-200 rounded-lg px-4 py-3">
                      <p className="text-xs text-slate-500 print:text-gray-500 mb-1">{ev}</p>
                      <p className="text-base font-bold text-white print:text-gray-900">
                        {pb?.record_time ?? '-'}
                        {isMonthPb && <span className="ml-2 text-xs text-yellow-400">★ 이달 갱신</span>}
                      </p>
                      {fina && <p className="text-xs text-slate-500 print:text-gray-400 mt-0.5">FINA {fina}pt</p>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 멘탈 일지 요약 */}
            {mentalLogs.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-300 print:text-gray-700 uppercase tracking-wider mb-4">멘탈 일지 ({mentalLogs.length}건)</h2>
                {topEmotion && (
                  <p className="text-sm text-slate-400 print:text-gray-600 mb-3">
                    가장 자주 기록된 감정: <span className="text-white print:text-gray-900 font-semibold">{topEmotion[0]}</span> ({topEmotion[1]}회)
                  </p>
                )}
                <div className="space-y-2">
                  {mentalLogs.map(m => (
                    <div key={m.id} className="flex gap-4 text-sm border-b border-slate-700/20 print:border-gray-100 pb-2">
                      <span className="text-slate-500 print:text-gray-400 w-24 shrink-0">{m.date}</span>
                      <span className="text-slate-300 print:text-gray-700 line-clamp-2">
                        {m.emotion} {m.emotion_note || ''} · 집중: {m.todays_focus || '-'} · 개선: {m.improve_point || '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI 총평 */}
            {aiSummary && (
              <div>
                <h2 className="text-sm font-bold text-slate-300 print:text-gray-700 uppercase tracking-wider mb-4">월간 종합 분석 결과서</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {aiReportSections.map((section, index) => (
                    <div
                      key={`${section.title}-${index}`}
                      className={index === 0 || section.title.includes('결론') ? 'xl:col-span-2' : ''}
                    >
                      <ReportSectionCard section={section} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 푸터 */}
            <div className="border-t border-slate-700/50 print:border-gray-200 pt-4 flex justify-between text-xs text-slate-600 print:text-gray-400">
              <span>WONJUN PROJECT · 2028 LA 올림픽</span>
              <span>생성일: {new Date().toLocaleDateString('ko-KR')}</span>
            </div>
          </>
        )}
      </div>

      {/* 인쇄용 CSS */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          aside { display: none !important; }
          main { margin-left: 0 !important; padding: 0 !important; }
          .report-body { box-shadow: none; }
        }
      `}</style>
    </div>
  )
}
