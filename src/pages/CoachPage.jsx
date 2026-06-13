import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, ClipboardCheck, FileText, MessageSquare, Save, Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { calcFinaPoints, timeToSeconds } from '../lib/fina'

function average(rows, key) {
  const values = rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value) && value > 0)
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function bestByEvent(records) {
  const map = {}
  records.forEach((record) => {
    if (!map[record.event] || timeToSeconds(record.record_time) < timeToSeconds(map[record.event].record_time)) {
      map[record.event] = record
    }
  })
  return map
}

export default function CoachPage() {
  const user = useAuthStore((s) => s.user)
  const role = useAuthStore((s) => s.role)
  const [loading, setLoading] = useState(true)
  const [setupError, setSetupError] = useState('')
  const [athletes, setAthletes] = useState([])
  const [selectedAthleteId, setSelectedAthleteId] = useState('')
  const [data, setData] = useState({
    logs: [],
    pbs: [],
    mentalLogs: [],
    bodyRecords: [],
    strengthRecords: [],
    competitions: [],
    competitionResults: [],
    notes: [],
  })
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const selectedAthlete = athletes.find((athlete) => athlete.user_id === selectedAthleteId)

  const fetchCoachData = async () => {
    setLoading(true)
    setSetupError('')
    try {
      const { data: links, error: linkError } = await supabase
        .from('coach_athlete_links')
        .select('*')
        .eq('coach_id', user.id)
        .eq('status', 'active')

      if (linkError) throw linkError

      const athleteIds = links?.map((link) => link.athlete_id) || []
      if (!athleteIds.length) {
        setAthletes([])
        setSelectedAthleteId('')
        setData({ logs: [], pbs: [], mentalLogs: [], bodyRecords: [], strengthRecords: [], competitions: [], competitionResults: [], notes: [] })
        return
      }

      const { data: profiles } = await supabase
        .from('athlete_profiles')
        .select('*')
        .in('user_id', athleteIds)

      setAthletes(profiles || [])
      setSelectedAthleteId((current) => current || profiles?.[0]?.user_id || athleteIds[0])
    } catch (error) {
      setSetupError(error.message || '코치 권한 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const fetchAthleteData = async (athleteId) => {
    if (!athleteId) return
    setLoading(true)
    try {
      const [logsRes, pbsRes, mentalRes, bodyRes, strengthRes, competitionsRes, notesRes] = await Promise.all([
        supabase.from('training_logs').select('*').eq('user_id', athleteId).order('date', { ascending: false }).limit(30),
        supabase.from('personal_bests').select('*').eq('user_id', athleteId).order('achieved_date', { ascending: true }),
        supabase.from('mental_journals').select('*').eq('user_id', athleteId).order('date', { ascending: false }).limit(14),
        supabase.from('body_records').select('*').eq('user_id', athleteId).order('date', { ascending: false }).limit(5),
        supabase.from('strength_records').select('*').eq('user_id', athleteId).order('date', { ascending: false }).limit(10),
        supabase.from('competitions').select('*').eq('user_id', athleteId).order('start_date', { ascending: true }),
        supabase.from('coach_notes').select('*').eq('athlete_id', athleteId).order('note_date', { ascending: false }).limit(10),
      ])

      const competitionIds = competitionsRes.data?.map((competition) => competition.id) || []
      const resultsRes = competitionIds.length
        ? await supabase.from('competition_results').select('*').eq('user_id', athleteId).in('competition_id', competitionIds)
        : { data: [] }

      setData({
        logs: logsRes.data || [],
        pbs: pbsRes.data || [],
        mentalLogs: mentalRes.data || [],
        bodyRecords: bodyRes.data || [],
        strengthRecords: strengthRes.data || [],
        competitions: competitionsRes.data || [],
        competitionResults: resultsRes.data || [],
        notes: notesRes.data || [],
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.id) fetchCoachData()
  }, [user?.id])

  useEffect(() => {
    if (selectedAthleteId) fetchAthleteData(selectedAthleteId)
  }, [selectedAthleteId])

  const summary = useMemo(() => {
    const recentLogs = data.logs.slice(0, 7)
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
    const monthLogs = data.logs.filter((log) => log.date >= monthStart && log.date <= monthEnd)
    const monthPbs = data.pbs.filter((pb) => pb.achieved_date >= monthStart && pb.achieved_date <= monthEnd)
    const totalDistance = recentLogs.reduce((sum, log) => sum + (log.total_distance_m || 0), 0)
    const monthDistance = monthLogs.reduce((sum, log) => sum + (log.total_distance_m || 0), 0)
    const avgCondition = average(recentLogs, 'condition_score')
    const avgFatigue = average(recentLogs, 'forearm_fatigue')
    const avgSleep = average(recentLogs, 'sleep_hours')
    const pbs = bestByEvent(data.pbs)
    const topPb = Object.values(pbs)
      .map((pb) => ({ ...pb, fina: calcFinaPoints(pb.event, pb.record_time) || 0 }))
      .sort((a, b) => b.fina - a.fina)[0]
    const resultIssues = data.competitionResults
      .filter((result) => result.record_time && pbs[result.event])
      .map((result) => ({
        ...result,
        gapSec: timeToSeconds(result.record_time) - timeToSeconds(pbs[result.event].record_time),
      }))
      .filter((result) => result.gapSec > 0.5)
      .sort((a, b) => b.gapSec - a.gapSec)
    const topIssue = resultIssues[0]

    const risks = [
      avgFatigue >= 6.5 && `피로 평균이 ${avgFatigue.toFixed(1)}/10입니다. 회복일 또는 수면 상태 확인이 필요합니다.`,
      avgSleep > 0 && avgSleep < 7 && `평균 수면이 ${avgSleep.toFixed(1)}시간입니다. 강도 높은 훈련 전 수면 관리가 필요합니다.`,
      topIssue && `${topIssue.event} 시합 기록이 PB보다 +${topIssue.gapSec.toFixed(2)}초 늦습니다. 페이스 붕괴 구간을 확인하세요.`,
      recentLogs.length < 3 && '최근 훈련 기록이 부족합니다. 선수 입력 상태를 먼저 확인하세요.',
    ].filter(Boolean)

    const checkpoints = [
      topIssue && `${topIssue.event}: 초반 진입, 턴 후 15m, 마지막 50m 유지력을 분리해서 점검하세요.`,
      topPb && `강점 종목은 ${topPb.event}입니다. 이 종목의 페이스 패턴을 기준 모델로 삼을 수 있습니다.`,
      avgCondition && avgCondition < 6 && '컨디션이 낮은 편입니다. 워밍업 루틴과 훈련 전 회복 상태를 확인하세요.',
      '다음 훈련에서는 목표 페이스 반복 세트와 실제 스트로크 수를 함께 기록하게 하세요.',
    ].filter(Boolean)

    const inputStatus = [
      { label: '훈련 일지', count: data.logs.length, ok: data.logs.length >= 3 },
      { label: '멘탈 일지', count: data.mentalLogs.length, ok: data.mentalLogs.length >= 2 },
      { label: '신체 기록', count: data.bodyRecords.length, ok: data.bodyRecords.length >= 1 },
      { label: '근력 기록', count: data.strengthRecords.length, ok: data.strengthRecords.length >= 1 },
    ]

    const competitionAnalysis = topIssue
      ? [
          `${topIssue.event} 경기 기록이 현재 PB보다 +${topIssue.gapSec.toFixed(2)}초 늦습니다.`,
          'PB 대비 손실 원인은 초반 오버페이스, 중반 스트로크 효율 저하, 턴 이후 재가속 부족 중 하나일 가능성이 큽니다.',
          '보완 훈련은 레이스 페이스 반복, 마지막 50m 유지, 턴 후 15m 가속 체크를 우선 배치하세요.',
        ]
      : data.competitionResults.length
        ? ['최근 시합 결과에서 PB 대비 큰 손실 기록은 확인되지 않았습니다. 다음 시합에서는 랩별 페이스 기록을 함께 남기면 분석 정확도가 올라갑니다.']
        : ['아직 시합 결과 기록이 없습니다. 시합 후 종목별 기록과 순위, 느낀 문제 구간을 함께 입력해야 코칭 분석이 가능합니다.']

    const monthlyReport = [
      monthLogs.length
        ? `이번 달 훈련은 ${monthLogs.length}회, 총 ${(monthDistance / 1000).toFixed(1)}km입니다.`
        : '이번 달 훈련 기록이 아직 없습니다.',
      monthPbs.length
        ? `이번 달 기록 변화는 ${monthPbs.length}건입니다. 갱신 종목의 훈련 패턴을 다음 달 계획에 반영하세요.`
        : '이번 달 PB 변화가 아직 없습니다. 기록 측정일을 정해 성장 여부를 확인하는 것이 좋습니다.',
      risks.length
        ? '다음 달 계획은 위험 신호를 먼저 낮춘 뒤, 주종목 페이스 훈련 비중을 조절하는 방향이 적절합니다.'
        : '현재 위험 신호가 크지 않다면 주종목 레이스 페이스와 후반 유지력 훈련을 조금 더 밀어볼 수 있습니다.',
    ]

    return {
      recentLogs,
      monthLogs,
      monthPbs,
      totalDistance,
      monthDistance,
      avgCondition,
      avgFatigue,
      avgSleep,
      topPb,
      topIssue,
      risks,
      checkpoints,
      inputStatus,
      competitionAnalysis,
      monthlyReport,
    }
  }, [data])

  const saveCoachNote = async () => {
    if (!note.trim() || !selectedAthleteId) return
    setSavingNote(true)
    const { data: inserted, error } = await supabase
      .from('coach_notes')
      .insert({
        coach_id: user.id,
        athlete_id: selectedAthleteId,
        category: '코칭 메모',
        content: note.trim(),
        note_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()
    if (!error && inserted) {
      setData((current) => ({ ...current, notes: [inserted, ...current.notes] }))
      setNote('')
    }
    setSavingNote(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">코치 보드</h1>
        <p className="text-slate-400 text-sm mt-0.5">연결된 선수의 상태를 코치 관점으로 확인합니다</p>
      </div>

      {role && role !== 'coach' && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-orange-400">현재 계정 role은 `{role}`입니다. 실제 운영에서는 coach role 계정만 이 페이지를 볼 수 있게 제한합니다.</p>
        </div>
      )}

      {setupError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-400">
            코치 권한 테이블이 아직 적용되지 않았습니다. `supabase/coach_access.sql`을 Supabase SQL Editor에서 실행해주세요.
          </p>
          <p className="text-xs text-slate-500 mt-2">{setupError}</p>
        </div>
      )}

      <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-4 mb-6">
        <label className="block text-xs text-slate-400 mb-2">선수 선택</label>
        {athletes.length ? (
          <select
            value={selectedAthleteId}
            onChange={(event) => setSelectedAthleteId(event.target.value)}
            className="w-full max-w-sm bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            {athletes.map((athlete) => (
              <option key={athlete.user_id} value={athlete.user_id}>
                {athlete.name || athlete.user_id}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-slate-500">연결된 선수가 없습니다.</p>
        )}
      </div>

      {selectedAthlete && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {[
              { label: '최근 훈련량', value: `${(summary.totalDistance / 1000).toFixed(1)}km`, sub: `최근 ${summary.recentLogs.length}회` },
              { label: '피로 / 컨디션', value: `${summary.avgFatigue ? summary.avgFatigue.toFixed(1) : '-'} / ${summary.avgCondition ? summary.avgCondition.toFixed(1) : '-'}`, sub: '10점 기준' },
              { label: '수면', value: summary.avgSleep ? `${summary.avgSleep.toFixed(1)}h` : '-', sub: '최근 훈련 평균' },
              { label: '최고 FINA', value: summary.topPb ? `${summary.topPb.fina}pt` : '-', sub: summary.topPb?.event || 'PB 없음' },
            ].map((card) => (
              <div key={card.label} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-4">
                <p className="text-xs text-slate-500 mb-1">{card.label}</p>
                <p className="text-xl font-bold text-white">{card.value}</p>
                <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={16} className="text-green-400" />
                <h2 className="text-sm font-semibold text-slate-300">선수 상태 요약</h2>
              </div>
              <div className="space-y-2">
                {[
                  `최근 훈련량은 ${(summary.totalDistance / 1000).toFixed(1)}km이며, 피로 ${summary.avgFatigue ? summary.avgFatigue.toFixed(1) : '-'}, 컨디션 ${summary.avgCondition ? summary.avgCondition.toFixed(1) : '-'}입니다.`,
                  summary.topPb ? `현재 기록 기준점은 ${summary.topPb.event} ${summary.topPb.record_time} / FINA ${summary.topPb.fina}pt입니다.` : 'PB 기준점이 부족해 기록 상태 판단이 제한적입니다.',
                  summary.monthPbs.length ? `이번 달 기록 변화가 ${summary.monthPbs.length}건 있습니다.` : '이번 달 기록 변화는 아직 확인되지 않았습니다.',
                ].map((line, index) => (
                  <p key={index} className="text-sm text-slate-300 bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2 leading-relaxed">{line}</p>
                ))}
              </div>
            </section>

            <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className="text-red-400" />
                <h2 className="text-sm font-semibold text-slate-300">위험 신호</h2>
              </div>
              <div className="space-y-2">
                {(summary.risks.length ? summary.risks : ['현재 데이터 기준 즉시 확인할 위험 신호는 크지 않습니다.']).map((risk, index) => (
                  <p key={index} className="text-sm text-slate-300 bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2 leading-relaxed">{risk}</p>
                ))}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardCheck size={16} className="text-blue-400" />
                <h2 className="text-sm font-semibold text-slate-300">코칭 체크포인트</h2>
              </div>
              <div className="space-y-2">
                {summary.checkpoints.map((checkpoint, index) => (
                  <p key={index} className="text-sm text-slate-300 bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2 leading-relaxed">{checkpoint}</p>
                ))}
              </div>
            </section>

            <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={16} className="text-yellow-400" />
                <h2 className="text-sm font-semibold text-slate-300">시합 분석</h2>
              </div>
              <div className="space-y-2">
                {summary.competitionAnalysis.map((line, index) => (
                  <p key={index} className="text-sm text-slate-300 bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2 leading-relaxed">{line}</p>
                ))}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-purple-400" />
                <h2 className="text-sm font-semibold text-slate-300">월간 코치 리포트</h2>
              </div>
              <div className="space-y-2">
                {summary.monthlyReport.map((line, index) => (
                  <p key={index} className="text-sm text-slate-300 bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2 leading-relaxed">{line}</p>
                ))}
              </div>
            </section>

            <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardCheck size={16} className="text-green-400" />
                <h2 className="text-sm font-semibold text-slate-300">선수 입력 현황</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {summary.inputStatus.map((item) => (
                  <div key={item.label} className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                    <p className={`text-sm font-bold ${item.ok ? 'text-green-400' : 'text-orange-400'}`}>
                      {item.count}건
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={16} className="text-purple-400" />
              <h2 className="text-sm font-semibold text-slate-300">코치 메모</h2>
            </div>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="다음 훈련 지시, 보완할 기술, 시합 전 체크사항 등을 작성하세요."
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none mb-3"
            />
            <button
              type="button"
              onClick={saveCoachNote}
              disabled={savingNote || !note.trim()}
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              <Save size={14} />
              저장
            </button>

            <div className="mt-4 space-y-2">
              {data.notes.length ? data.notes.map((item) => (
                <div key={item.id} className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-500 mb-1">{item.note_date} · {item.category}</p>
                  <p className="text-sm text-slate-300 leading-relaxed">{item.content}</p>
                </div>
              )) : (
                <p className="text-sm text-slate-500">아직 작성된 코치 메모가 없습니다.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
