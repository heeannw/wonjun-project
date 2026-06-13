import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BarChart3, CalendarDays, Check, ClipboardCheck, Edit3, MessageSquare, Save, Target, Trash2, Trophy, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { calcFinaPoints, timeToSeconds } from '../lib/fina'

const feedbackCategories = ['수영 피드백', '근력 피드백', '멘탈 피드백', '신체 피드백', '다음 훈련 지시']

const viewMeta = {
  home: { title: '코치 홈', desc: '연결된 선수의 핵심 상태를 빠르게 확인합니다' },
  status: { title: '선수 상태 파악', desc: '훈련량, 피로, 컨디션, 멘탈, 신체 변화를 함께 봅니다' },
  schedule: { title: '시합 일정', desc: '다가오는 시합과 최근 시합 흐름을 확인합니다' },
  pb: { title: '선수 PB 현황', desc: '종목별 최고 기록과 FINA 기준 경쟁력을 봅니다' },
  race: { title: '시합 결과 분석', desc: 'PB 대비 손실과 보완 훈련 방향을 정리합니다' },
  feedback: { title: '선수 피드백', desc: '훈련, 근력, 멘탈, 신체 데이터를 보고 선수에게 피드백을 보냅니다' },
  notes: { title: '코치 메모', desc: '코치 내부 체크사항과 다음 훈련 지시를 남깁니다' },
}

function average(rows, key) {
  const values = rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value) && value > 0)
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function bestByEvent(records) {
  return records.reduce((map, record) => {
    if (!map[record.event] || timeToSeconds(record.record_time) < timeToSeconds(map[record.event].record_time)) {
      map[record.event] = record
    }
    return map
  }, {})
}

function InfoCard({ label, value, sub, tone = 'blue' }) {
  const toneClass = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
    purple: 'text-purple-400',
  }[tone]

  return (
    <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${toneClass}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{sub}</p>}
    </div>
  )
}

function TextBox({ children, tone = 'default' }) {
  const toneClass = tone === 'risk'
    ? 'border-red-500/20 bg-red-500/5'
    : tone === 'good'
      ? 'border-green-500/20 bg-green-500/5'
      : 'border-slate-800 bg-[#0f1117]'
  return <p className={`text-sm text-slate-300 rounded-lg border px-3 py-2 leading-relaxed ${toneClass}`}>{children}</p>
}

function formatDateLabel(date) {
  const parsed = new Date(`${date}T00:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${date.slice(5).replace('-', '/')} (${weekdays[parsed.getDay()]})`
}

export default function CoachPage() {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const view = location.pathname.split('/')[2] || 'home'
  const meta = viewMeta[view] || viewMeta.home
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
    replies: [],
  })
  const [note, setNote] = useState('')
  const [category, setCategory] = useState('수영 피드백')
  const [savingNote, setSavingNote] = useState(false)
  const [feedbackDate, setFeedbackDate] = useState('all')
  const [editingFeedbackId, setEditingFeedbackId] = useState(null)
  const [editFeedbackCategory, setEditFeedbackCategory] = useState('수영 피드백')
  const [editFeedbackContent, setEditFeedbackContent] = useState('')
  const [replyDrafts, setReplyDrafts] = useState({})
  const [savingReplyId, setSavingReplyId] = useState(null)
  const [actionError, setActionError] = useState('')

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
        return
      }

      const { data: profiles } = await supabase
        .from('athlete_profiles')
        .select('*')
        .in('user_id', athleteIds)

      const profileMap = Object.fromEntries((profiles || []).map((profile) => [profile.user_id, profile]))
      const linkedAthletes = athleteIds.map((athleteId) => profileMap[athleteId] || {
        user_id: athleteId,
        name: '연결 선수',
        main_events: [],
        goal: '',
        team: '',
      })
      setAthletes(linkedAthletes)
      setSelectedAthleteId((current) => current || linkedAthletes[0]?.user_id || athleteIds[0])
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
      const [logsRes, pbsRes, mentalRes, bodyRes, strengthRes, competitionsRes, notesRes, repliesRes] = await Promise.all([
        supabase.from('training_logs').select('*').eq('user_id', athleteId).order('date', { ascending: false }).limit(40),
        supabase.from('personal_bests').select('*').eq('user_id', athleteId).order('achieved_date', { ascending: true }),
        supabase.from('mental_journals').select('*').eq('user_id', athleteId).order('date', { ascending: false }).limit(20),
        supabase.from('body_records').select('*').eq('user_id', athleteId).order('date', { ascending: false }).limit(10),
        supabase.from('strength_records').select('*').eq('user_id', athleteId).order('date', { ascending: false }).limit(20),
        supabase.from('competitions').select('*').eq('user_id', athleteId).order('start_date', { ascending: false }).limit(20),
        supabase.from('coach_notes').select('*').eq('athlete_id', athleteId).order('note_date', { ascending: false }).limit(30),
        supabase.from('coach_note_replies').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: true }).limit(100),
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
        replies: repliesRes.data || [],
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.id) return undefined
    const timer = window.setTimeout(() => fetchCoachData(), 0)
    return () => window.clearTimeout(timer)
  }, [user?.id])

  useEffect(() => {
    if (!selectedAthleteId) return undefined
    const timer = window.setTimeout(() => fetchAthleteData(selectedAthleteId), 0)
    return () => window.clearTimeout(timer)
  }, [selectedAthleteId])

  useEffect(() => {
    if (!selectedAthleteId) return undefined

    const repliesChannel = supabase
      .channel(`coach-view-replies-${selectedAthleteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'coach_note_replies',
          filter: `athlete_id=eq.${selectedAthleteId}`,
        },
        (payload) => {
          setData((current) => {
            if (payload.eventType === 'INSERT') {
              if (current.replies.some((item) => item.id === payload.new.id)) return current
              return { ...current, replies: [...current.replies, payload.new] }
            }
            if (payload.eventType === 'UPDATE') {
              return {
                ...current,
                replies: current.replies.map((item) => item.id === payload.new.id ? payload.new : item),
              }
            }
            if (payload.eventType === 'DELETE') {
              return {
                ...current,
                replies: current.replies.filter((item) => item.id !== payload.old.id),
              }
            }
            return current
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(repliesChannel)
    }
  }, [selectedAthleteId])

  const summary = useMemo(() => {
    const recentLogs = data.logs.slice(0, 7)
    const recentMental = data.mentalLogs.slice(0, 7)
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthLogs = data.logs.filter((log) => log.date >= monthStart)
    const bestMap = bestByEvent(data.pbs)
    const bestPbs = Object.values(bestMap)
      .map((pb) => ({ ...pb, fina: calcFinaPoints(pb.event, pb.record_time) || 0 }))
      .sort((a, b) => b.fina - a.fina)
    const totalDistance = recentLogs.reduce((sum, log) => sum + (log.total_distance_m || 0), 0)
    const monthDistance = monthLogs.reduce((sum, log) => sum + (log.total_distance_m || 0), 0)
    const avgCondition = average(recentLogs, 'condition_score')
    const avgFatigue = average(recentLogs, 'forearm_fatigue')
    const avgSleep = average(recentLogs, 'sleep_hours')
    const avgRpe = average(recentLogs, 'rpe')
    const latestBody = data.bodyRecords[0]
    const previousBody = data.bodyRecords[1]
    const bodyChange = latestBody && previousBody ? latestBody.weight - previousBody.weight : null
    const strengthVolume = data.strengthRecords.reduce((sum, row) => sum + ((row.weight || 0) * (row.reps || 0) * (row.sets || 0)), 0)
    const upcoming = data.competitions.filter((competition) => (competition.end_date || competition.start_date) >= today).sort((a, b) => a.start_date.localeCompare(b.start_date))
    const competitionMap = Object.fromEntries(data.competitions.map((competition) => [competition.id, competition]))
    const raceIssues = data.competitionResults
      .filter((result) => result.record_time && bestMap[result.event])
      .map((result) => ({
        ...result,
        competition: competitionMap[result.competition_id],
        pb: bestMap[result.event],
        gapSec: timeToSeconds(result.record_time) - timeToSeconds(bestMap[result.event].record_time),
      }))
      .sort((a, b) => b.gapSec - a.gapSec)

    const risks = [
      avgFatigue >= 6.5 && `피로가 ${avgFatigue.toFixed(1)}/10로 높습니다. 강도보다 회복 상태를 먼저 확인해야 합니다.`,
      avgSleep > 0 && avgSleep < 7 && `최근 평균 수면이 ${avgSleep.toFixed(1)}시간입니다. 수면 부족이 후반 페이스 저하로 이어질 수 있습니다.`,
      raceIssues[0]?.gapSec > 0.5 && `${raceIssues[0].event} 시합 기록이 PB보다 +${raceIssues[0].gapSec.toFixed(2)}초 늦습니다.`,
      avgCondition > 0 && avgCondition < 6 && `컨디션 평균이 ${avgCondition.toFixed(1)}/10입니다. 훈련 전 몸 상태 확인이 필요합니다.`,
    ].filter(Boolean)

    return {
      recentLogs,
      recentMental,
      monthLogs,
      bestPbs,
      topPb: bestPbs[0],
      totalDistance,
      monthDistance,
      avgCondition,
      avgFatigue,
      avgSleep,
      avgRpe,
      latestBody,
      bodyChange,
      strengthVolume,
      upcoming,
      raceIssues,
      risks,
    }
  }, [data])

  const saveCoachNote = async (forcedCategory = category) => {
    if (!note.trim() || !selectedAthleteId) return
    setActionError('')
    setSavingNote(true)
    const { data: inserted, error } = await supabase
      .from('coach_notes')
      .insert({
        coach_id: user.id,
        athlete_id: selectedAthleteId,
        category: forcedCategory,
        content: note.trim(),
        note_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()

    if (error) {
      setActionError(`피드백 저장 실패: ${error.message}`)
    } else if (inserted) {
      setData((current) => ({ ...current, notes: [inserted, ...current.notes] }))
      setNote('')
    }
    setSavingNote(false)
  }

  const startEditFeedback = (item) => {
    setEditingFeedbackId(item.id)
    setEditFeedbackCategory(item.category)
    setEditFeedbackContent(item.content)
  }

  const cancelEditFeedback = () => {
    setEditingFeedbackId(null)
    setEditFeedbackCategory('수영 피드백')
    setEditFeedbackContent('')
  }

  const updateCoachFeedback = async (id) => {
    if (!editFeedbackContent.trim()) return
    setActionError('')
    const { data: updated, error } = await supabase
      .from('coach_notes')
      .update({
        category: editFeedbackCategory,
        content: editFeedbackContent.trim(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      setActionError(`피드백 수정 실패: ${error.message}`)
    } else if (updated) {
      setData((current) => ({
        ...current,
        notes: current.notes.map((item) => item.id === id ? updated : item),
      }))
      cancelEditFeedback()
    }
  }

  const deleteCoachFeedback = async (id) => {
    if (!window.confirm('이 피드백을 삭제할까요? 선수 화면에서도 보이지 않게 됩니다.')) return
    setActionError('')
    const { error } = await supabase.from('coach_notes').delete().eq('id', id)
    if (error) {
      setActionError(`피드백 삭제 실패: ${error.message}`)
    } else {
      setData((current) => ({
        ...current,
        notes: current.notes.filter((item) => item.id !== id),
      }))
      if (editingFeedbackId === id) cancelEditFeedback()
    }
  }

  const saveCoachReply = async (feedback) => {
    const content = replyDrafts[feedback.id]?.trim()
    if (!content) return
    setActionError('')
    setSavingReplyId(feedback.id)
    const { data: inserted, error } = await supabase
      .from('coach_note_replies')
      .insert({
        note_id: feedback.id,
        coach_id: user.id,
        athlete_id: selectedAthleteId,
        sender_id: user.id,
        sender_role: 'coach',
        content,
        reply_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()

    if (error) {
      setActionError(`답글 저장 실패: ${error.message}`)
    } else if (inserted) {
      setData((current) => ({
        ...current,
        replies: current.replies.some((item) => item.id === inserted.id)
          ? current.replies
          : [...current.replies, inserted],
      }))
      setReplyDrafts((current) => ({ ...current, [feedback.id]: '' }))
    }
    setSavingReplyId(null)
  }

  const renderAthleteSelector = () => (
    <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-4 mb-6">
      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-2">선수 선택</label>
          {athletes.length ? (
            <select
              value={selectedAthleteId}
              onChange={(event) => setSelectedAthleteId(event.target.value)}
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {athletes.map((athlete) => <option key={athlete.user_id} value={athlete.user_id}>{athlete.name || athlete.user_id}</option>)}
            </select>
          ) : (
            <p className="text-sm text-slate-500">연결된 선수가 없습니다.</p>
          )}
        </div>

        {selectedAthlete && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2 min-h-[72px]">
              <p className="text-xs text-slate-500 mb-1">선수</p>
              <p className="text-sm font-semibold text-white">{selectedAthlete.name || '이름 없음'}</p>
              <p className="text-xs text-slate-500 mt-0.5">{selectedAthlete.team || '소속 미입력'}</p>
            </div>
            <div className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2 min-h-[72px]">
              <p className="text-xs text-slate-500 mb-1">전문 종목</p>
              <p className="text-sm font-semibold text-white leading-relaxed break-keep">{selectedAthlete.main_events?.length ? selectedAthlete.main_events.join(', ') : '미입력'}</p>
            </div>
            <div className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2 min-h-[72px]">
              <p className="text-xs text-slate-500 mb-1">목표</p>
              <p className="text-sm font-semibold text-white leading-relaxed break-keep">{selectedAthlete.goal || '미입력'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderHome = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <InfoCard label="최근 훈련량" value={`${(summary.totalDistance / 1000).toFixed(1)}km`} sub={`최근 ${summary.recentLogs.length}회`} />
        <InfoCard label="피로 / 컨디션" value={`${summary.avgFatigue ? summary.avgFatigue.toFixed(1) : '-'} / ${summary.avgCondition ? summary.avgCondition.toFixed(1) : '-'}`} sub="10점 기준" tone="orange" />
        <InfoCard label="최고 FINA" value={summary.topPb ? `${summary.topPb.fina}pt` : '-'} sub={summary.topPb?.event || 'PB 없음'} tone="green" />
        <InfoCard label="위험 신호" value={`${summary.risks.length}건`} sub={summary.risks[0] || '즉시 확인할 위험 신호 없음'} tone={summary.risks.length ? 'red' : 'green'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[
          { to: '/coach/status', icon: BarChart3, title: '선수 상태 파악', desc: '훈련, 피로, 컨디션, 몸 상태를 한 번에 확인' },
          { to: '/coach/schedule', icon: CalendarDays, title: '시합 일정', desc: '다가오는 시합과 최근 시합 흐름 확인' },
          { to: '/coach/pb', icon: Trophy, title: 'PB 현황', desc: '종목별 최고 기록과 경쟁력 확인' },
          { to: '/coach/race', icon: Target, title: '시합 결과 분석', desc: 'PB 대비 손실과 보완 훈련 제안' },
          { to: '/coach/feedback', icon: MessageSquare, title: '선수 피드백', desc: '수영, 근력, 멘탈, 신체 피드백 전송' },
          { to: '/coach/notes', icon: ClipboardCheck, title: '코치 메모', desc: '코치 내부 체크사항과 다음 훈련 지시' },
        ].map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5 hover:border-blue-500/50 transition">
            <Icon size={18} className="text-blue-400 mb-3" />
            <h2 className="text-white font-semibold mb-1">{title}</h2>
            <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )

  const renderStatus = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <InfoCard label="이번 달 훈련" value={`${summary.monthLogs.length}회`} sub={`${(summary.monthDistance / 1000).toFixed(1)}km`} />
        <InfoCard label="운동 강도" value={summary.avgRpe ? summary.avgRpe.toFixed(1) : '-'} sub="최근 7회 평균" tone="orange" />
        <InfoCard label="수면" value={summary.avgSleep ? `${summary.avgSleep.toFixed(1)}h` : '-'} sub="최근 훈련 평균" tone="purple" />
        <InfoCard label="현재 체중" value={summary.latestBody ? `${summary.latestBody.weight}kg` : '-'} sub={summary.bodyChange === null ? '비교 기록 없음' : `${summary.bodyChange > 0 ? '+' : ''}${summary.bodyChange.toFixed(1)}kg 변화`} tone="green" />
      </div>

      <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
        <h2 className="text-white font-semibold mb-4">상태 판단</h2>
        <div className="space-y-2">
          <TextBox tone="good">좋은 점: 최고 기록 기준점은 {summary.topPb ? `${summary.topPb.event} ${summary.topPb.record_time}` : '아직 부족'}이며, 최근 훈련 데이터와 함께 추적할 수 있습니다.</TextBox>
          <TextBox tone={summary.risks.length ? 'risk' : 'good'}>보완 필요: {summary.risks[0] || '현재 데이터 기준 큰 위험 신호는 없습니다. 주종목 페이스 유지력 점검을 이어가면 됩니다.'}</TextBox>
          <TextBox>체크할 것: 다음 훈련에서는 실제 페이스, 스트로크 수, 마지막 50m 유지력, 훈련 후 피로 변화를 같이 확인하세요.</TextBox>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-white font-semibold mb-3">최근 훈련</h2>
          <div className="space-y-2">
            {summary.recentLogs.map((log) => (
              <div key={log.id} className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2">
                <p className="text-sm text-white font-semibold">{log.date} · {log.main_event || '훈련'}</p>
                <p className="text-xs text-slate-500 mt-1">{(log.total_distance_m || 0).toLocaleString()}m · 강도 {log.rpe ?? '-'} · 컨디션 {log.condition_score ?? '-'} · 피로 {log.forearm_fatigue ?? '-'}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-white font-semibold mb-3">멘탈 / 근력 / 신체</h2>
          <div className="space-y-2">
            <TextBox>멘탈 기록 {data.mentalLogs.length}건, 최근 감정 흐름: {data.mentalLogs[0]?.mood || '미입력'}</TextBox>
            <TextBox>근력 기록 {data.strengthRecords.length}건, 최근 볼륨 합계: {summary.strengthVolume.toLocaleString()}kg</TextBox>
            <TextBox>신체 기록 {data.bodyRecords.length}건, 최근 체중: {summary.latestBody ? `${summary.latestBody.weight}kg` : '미입력'}</TextBox>
          </div>
        </section>
      </div>
    </div>
  )

  const renderSchedule = () => (
    <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
      <h2 className="text-white font-semibold mb-4">시합 일정</h2>
      <div className="space-y-3">
        {(data.competitions.length ? data.competitions : []).map((competition) => (
          <div key={competition.id} className="bg-[#0f1117] border border-slate-800 rounded-lg px-4 py-3">
            <p className="text-white font-semibold">{competition.name}</p>
            <p className="text-xs text-slate-500 mt-1">{competition.start_date} ~ {competition.end_date || competition.start_date} · {competition.location || '장소 미입력'} · {competition.pool_type || '-'}</p>
            <p className="text-xs text-blue-300 mt-2">{competition.events?.length ? competition.events.join(', ') : '종목 미입력'}</p>
          </div>
        ))}
        {!data.competitions.length && <p className="text-sm text-slate-500">등록된 시합 일정이 없습니다.</p>}
      </div>
    </section>
  )

  const renderPb = () => (
    <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="p-5 border-b border-slate-700/50">
        <h2 className="text-white font-semibold">종목별 최고 기록</h2>
        <p className="text-sm text-slate-500 mt-1">각 종목에서 가장 좋은 기록만 표시합니다.</p>
      </div>
      <div className="divide-y divide-slate-800">
        {summary.bestPbs.map((pb) => (
          <div key={pb.event} className="grid grid-cols-2 md:grid-cols-5 gap-3 px-5 py-3 text-sm">
            <span className="text-white font-semibold">{pb.event}</span>
            <span className="text-blue-300">{pb.record_time}</span>
            <span className="text-slate-400">{pb.achieved_date}</span>
            <span className="text-green-400">{pb.fina}pt</span>
            <span className="text-slate-500">{pb.meet_name || '-'}</span>
          </div>
        ))}
        {!summary.bestPbs.length && <p className="p-5 text-sm text-slate-500">PB 기록이 없습니다.</p>}
      </div>
    </section>
  )

  const renderRace = () => (
    <div className="space-y-4">
      <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
        <h2 className="text-white font-semibold mb-3">PB 대비 시합 손실</h2>
        <div className="space-y-2">
          {summary.raceIssues.map((issue) => (
            <div key={issue.id} className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2">
              <p className="text-sm text-white font-semibold">{issue.event} · {issue.record_time}</p>
              <p className={`text-xs mt-1 ${issue.gapSec > 0.5 ? 'text-orange-400' : 'text-green-400'}`}>PB {issue.pb.record_time} 대비 {issue.gapSec > 0 ? '+' : ''}{issue.gapSec.toFixed(2)}초 · {issue.competition?.name || '시합명 없음'}</p>
            </div>
          ))}
          {!summary.raceIssues.length && <p className="text-sm text-slate-500">시합 결과가 없거나 PB와 비교할 수 있는 기록이 없습니다.</p>}
        </div>
      </section>

      <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
        <h2 className="text-white font-semibold mb-3">보완 훈련 제안</h2>
        <div className="space-y-2">
          <TextBox>PB보다 늦어진 종목은 50m 단위 랩을 받아 초반 진입, 중반 유지, 턴 후 15m, 마지막 50m 중 어디서 손실이 나는지 분리해서 확인하세요.</TextBox>
          <TextBox>훈련 방법: 레이스 페이스 4~6회 반복, 마지막 50m 유지 세트, 턴 후 돌핀/브레이크아웃 체크를 같은 날 묶어서 진행하는 것이 좋습니다.</TextBox>
          <TextBox>기록이 좋은 종목은 페이스 모델로 삼고, 손실 종목은 그 페이스 분배와 스트로크 수를 비교하세요.</TextBox>
        </div>
      </section>
    </div>
  )

  const renderFeedback = () => (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
      <div className="space-y-4">
        <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-white font-semibold mb-3">피드백 작성 전 확인 자료</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextBox>훈련: 최근 {summary.recentLogs.length}회, {(summary.totalDistance / 1000).toFixed(1)}km, 평균 강도 {summary.avgRpe ? summary.avgRpe.toFixed(1) : '-'}</TextBox>
            <TextBox>근력: 최근 {data.strengthRecords.length}건, 계산 가능 볼륨 {summary.strengthVolume.toLocaleString()}kg</TextBox>
            <TextBox>멘탈: 최근 {data.mentalLogs.length}건, 최근 감정 {data.mentalLogs[0]?.mood || '미입력'}</TextBox>
            <TextBox>신체: 체중 {summary.latestBody ? `${summary.latestBody.weight}kg` : '미입력'}, 체지방 {summary.latestBody?.body_fat ? `${summary.latestBody.body_fat}%` : '미입력'}</TextBox>
          </div>
        </section>

        <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-white font-semibold mb-3">선수에게 보낼 피드백</h2>
          <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-3 mb-3">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
              {feedbackCategories.map((item) => <option key={item}>{item}</option>)}
            </select>
            <input value={selectedAthlete?.name || ''} readOnly className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2 text-slate-400 text-sm" />
          </div>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={7}
            placeholder="좋은 점, 문제 원인, 다음 훈련에서 체크할 것, 선수에게 전달할 지시를 구체적으로 작성하세요."
            className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none mb-3"
          />
          <button type="button" onClick={() => saveCoachNote(category)} disabled={savingNote || !note.trim()} className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            <Save size={14} />
            선수에게 보내기
          </button>
        </section>
      </div>

      <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
        <h2 className="text-white font-semibold mb-3">보낸 피드백 관리</h2>
        {(() => {
          const sentFeedbacks = data.notes.filter((item) => item.category !== '코치 메모')
          const feedbackDates = [...new Set(sentFeedbacks.map((item) => item.note_date))].sort((a, b) => b.localeCompare(a))
          const filteredFeedbacks = feedbackDate === 'all'
            ? sentFeedbacks
            : sentFeedbacks.filter((item) => item.note_date === feedbackDate)
          const repliesByNote = data.replies.reduce((map, reply) => {
            if (!map[reply.note_id]) map[reply.note_id] = []
            map[reply.note_id].push(reply)
            return map
          }, {})

          return (
            <>
              <div className="mb-4">
                <p className="text-xs text-slate-500 mb-2">날짜별 보기</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setFeedbackDate('all')}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      feedbackDate === 'all'
                        ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                        : 'border-slate-700 text-slate-500 hover:border-slate-500'
                    }`}
                  >
                    전체
                  </button>
                  {feedbackDates.map((date) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setFeedbackDate(date)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        feedbackDate === date
                          ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                          : 'border-slate-700 text-slate-500 hover:border-slate-500'
                      }`}
                    >
                      {formatDateLabel(date)}
                    </button>
                  ))}
                </div>
              </div>

        <div className="space-y-2">
                {filteredFeedbacks.map((item) => (
                  <div key={item.id} className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2">
                    {editingFeedbackId === item.id ? (
                      <div className="space-y-2">
                        <select
                          value={editFeedbackCategory}
                          onChange={(event) => setEditFeedbackCategory(event.target.value)}
                          className="w-full bg-[#111827] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                        >
                          {feedbackCategories.map((option) => <option key={option}>{option}</option>)}
                        </select>
                        <textarea
                          value={editFeedbackContent}
                          onChange={(event) => setEditFeedbackContent(event.target.value)}
                          rows={4}
                          className="w-full bg-[#111827] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateCoachFeedback(item.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                          >
                            <Check size={13} />
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditFeedback}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-600"
                          >
                            <X size={13} />
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mb-1 flex items-start justify-between gap-3">
                          <p className="text-xs text-slate-500">{item.note_date} · {item.category}</p>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => startEditFeedback(item)}
                              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-blue-300"
                              title="피드백 수정"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCoachFeedback(item.id)}
                              className="rounded-md p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                              title="피드백 삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{item.content}</p>
                        {(repliesByNote[item.id] || []).length > 0 && (
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
                                  {reply.sender_role === 'coach' ? '코치 답글' : '선수 답글'} · {reply.reply_date}
                                </p>
                                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{reply.content}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 border-t border-slate-800 pt-3">
                          <textarea
                            value={replyDrafts[item.id] || ''}
                            onChange={(event) => setReplyDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                            rows={3}
                            placeholder="선수 답글에 대한 답변이나 추가 지시를 남기세요."
                            className="w-full bg-[#111827] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none"
                          />
                          <button
                            type="button"
                            onClick={() => saveCoachReply(item)}
                            disabled={savingReplyId === item.id || !replyDrafts[item.id]?.trim()}
                            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
                          >
                            <MessageSquare size={13} />
                            답글 보내기
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {!filteredFeedbacks.length && (
                  <p className="text-sm text-slate-500">
                    {sentFeedbacks.length ? '선택한 날짜에 보낸 피드백이 없습니다.' : '아직 보낸 피드백이 없습니다.'}
                  </p>
                )}
              </div>
            </>
          )
        })()}
      </section>
    </div>
  )

  const renderNotes = () => (
    <section className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
      <h2 className="text-white font-semibold mb-3">코치 내부 메모</h2>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={4}
        placeholder="코치가 나중에 확인할 내부 체크사항을 작성하세요."
        className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none mb-3"
      />
      <button type="button" onClick={() => saveCoachNote('코치 메모')} disabled={savingNote || !note.trim()} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
        <Save size={14} />
        메모 저장
      </button>
      <div className="mt-4 space-y-2">
        {data.notes.filter((item) => item.category === '코치 메모').map((item) => (
          <div key={item.id} className="bg-[#0f1117] border border-slate-800 rounded-lg px-3 py-2">
            <p className="text-xs text-slate-500 mb-1">{item.note_date}</p>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{item.content}</p>
          </div>
        ))}
        {!data.notes.filter((item) => item.category === '코치 메모').length && <p className="text-sm text-slate-500">아직 코치 메모가 없습니다.</p>}
      </div>
    </section>
  )

  const renderView = () => {
    if (!selectedAthlete) return null
    if (view === 'status') return renderStatus()
    if (view === 'schedule') return renderSchedule()
    if (view === 'pb') return renderPb()
    if (view === 'race') return renderRace()
    if (view === 'feedback') return renderFeedback()
    if (view === 'notes') return renderNotes()
    return renderHome()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">{meta.title}</h1>
        <p className="text-slate-400 text-sm mt-0.5">{meta.desc}</p>
      </div>

      {setupError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-400">코치 권한 테이블 또는 연결 정보를 확인해야 합니다.</p>
          <p className="text-xs text-slate-500 mt-2">{setupError}</p>
        </div>
      )}

      {actionError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-400">{actionError}</p>
        </div>
      )}

      {renderAthleteSelector()}

      {loading ? (
        <p className="text-sm text-slate-500">코치 데이터를 불러오는 중입니다.</p>
      ) : (
        renderView()
      )}
    </div>
  )
}
