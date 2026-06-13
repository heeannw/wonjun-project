import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { calcFinaPoints, timeToSeconds } from '../lib/fina'
import { getTrendAnalysis } from '../lib/gemini'
import { useProfileStore } from '../store/profileStore'
import { Printer, BrainCircuit, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

function getMonthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  return { start, end }
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
  const [loading, setLoading] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setAiSummary('')
    const { start, end } = getMonthRange(year, month)
    const [logsRes, pbsRes, mentalRes] = await Promise.all([
      supabase.from('training_logs').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date'),
      supabase.from('personal_bests').select('*').eq('user_id', user.id),
      supabase.from('mental_logs').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date'),
    ])
    setLogs(logsRes.data || [])
    setPbs(pbsRes.data || [])
    setMentalLogs(mentalRes.data || [])
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

  // 이번 달 PB 갱신 기록
  const { start: mStart, end: mEnd } = getMonthRange(year, month)
  const monthPbs = pbs.filter(p => p.achieved_date >= mStart && p.achieved_date <= mEnd)

  // 종목별 현재 PB (가장 빠른 기록)
  const latestPbMap = {}
  pbs.forEach(p => {
    if (!latestPbMap[p.event] || timeToSeconds(p.record_time) < timeToSeconds(latestPbMap[p.event].record_time)) {
      latestPbMap[p.event] = p
    }
  })
  const mainEvents = ['자유형 400m', '자유형 800m', '자유형 1500m', '개인혼영 400m', '자유형 200m', '배영 100m']

  const runAiSummary = async () => {
    setAnalyzing(true)
    try {
      const result = await getTrendAnalysis(logs, Object.values(latestPbMap), profile)
      setAiSummary(result)
    } catch (e) {
      setAiSummary(`분석 오류: ${e.message}`)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div>
      {/* 화면용 헤더 (인쇄 시 숨김) */}
      <div className="print:hidden flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">월간 리포트</h1>
          <p className="text-slate-400 text-sm mt-0.5">월별 훈련 종합 결과서</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#1a1d27] border border-slate-700/50 rounded-lg px-3 py-2">
            <button onClick={prevMonth} className="text-slate-400 hover:text-white transition"><ChevronLeft size={16} /></button>
            <span className="text-white text-sm font-semibold w-20 text-center">{year}년 {month}월</span>
            <button onClick={nextMonth} className="text-slate-400 hover:text-white transition"><ChevronRight size={16} /></button>
          </div>
          <button
            onClick={runAiSummary}
            disabled={analyzing || trainDays === 0}
            className="flex items-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-sm px-4 py-2 rounded-lg transition disabled:opacity-40"
          >
            {analyzing ? <RefreshCw size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
            AI 총평 생성
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            <Printer size={14} />
            PDF 저장
          </button>
        </div>
      </div>

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
                <div className="grid grid-cols-5 gap-4">
                  {[
                    { label: '훈련일수', value: `${trainDays}일` },
                    { label: '총 거리', value: `${(totalDist / 1000).toFixed(1)}km` },
                    { label: '평균 운동 강도', value: avgRpe },
                    { label: '평균 수면', value: `${avgSleep}h` },
                    { label: '평균 컨디션', value: `${avgCondition}/10` },
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
                <table className="w-full text-sm">
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
              </div>
            )}

            {/* 현재 PB */}
            <div>
              <h2 className="text-sm font-bold text-slate-300 print:text-gray-700 uppercase tracking-wider mb-4">현재 PB 기록</h2>
              <div className="grid grid-cols-3 gap-3">
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
                <div className="space-y-2">
                  {mentalLogs.map(m => (
                    <div key={m.id} className="flex gap-4 text-sm border-b border-slate-700/20 print:border-gray-100 pb-2">
                      <span className="text-slate-500 print:text-gray-400 w-24 shrink-0">{m.date}</span>
                      <span className="text-slate-300 print:text-gray-700 line-clamp-2">{m.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI 총평 */}
            {aiSummary && (
              <div>
                <h2 className="text-sm font-bold text-slate-300 print:text-gray-700 uppercase tracking-wider mb-4">AI 코치 총평</h2>
                <div className="bg-[#0f1117] print:bg-gray-50 print:border print:border-gray-200 rounded-lg p-4 text-sm text-slate-300 print:text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {aiSummary}
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
