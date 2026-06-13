import { useState } from 'react'
import { Timer, Calculator, ChevronDown, BarChart2, TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react'
import TimeInput from '../components/TimeInput'

const EVENTS = [
  { label: '자유형 100m', distance: 100 },
  { label: '자유형 200m', distance: 200 },
  { label: '자유형 400m', distance: 400 },
  { label: '자유형 800m', distance: 800 },
  { label: '자유형 1500m', distance: 1500 },
  { label: '배영 100m', distance: 100 },
  { label: '배영 200m', distance: 200 },
  { label: '평영 100m', distance: 100 },
  { label: '평영 200m', distance: 200 },
  { label: '접영 100m', distance: 100 },
  { label: '접영 200m', distance: 200 },
  { label: '개인혼영 200m', distance: 200, isIM: true },
  { label: '개인혼영 400m', distance: 400, isIM: true },
]

const IM_STROKES = {
  200: ['접영', '배영', '평영', '자유형'],
  400: ['접영', '배영', '평영', '자유형'],
}

// 전략별 강도 (spread = 랩타임 변동 폭 비율)
const SPREAD = { light: 0.025, medium: 0.05, hard: 0.09 }

const STRATEGIES = [
  {
    id: 'even',
    label: '균등',
    sub: '모든 랩 동일 페이스',
    icon: Minus,
    color: 'blue',
    desc: '전 구간 일정한 속도 유지',
  },
  {
    id: 'front',
    label: '전반 타입',
    sub: '초반에 치고 나가기',
    icon: TrendingDown,
    color: 'orange',
    desc: '전반부 빠르게 → 후반 자연스럽게 감속',
  },
  {
    id: 'middle',
    label: '중반 타입',
    sub: '중반에 기어 올리기',
    icon: Zap,
    color: 'purple',
    desc: '초반 안정 → 중반 가속 → 후반 유지',
  },
  {
    id: 'back',
    label: '후반 타입',
    sub: '끝에 폭발 (네거티브)',
    icon: TrendingUp,
    color: 'green',
    desc: '초반 여유 → 후반 강하게 치고 나오기',
  },
]

const COLOR_MAP = {
  blue: { btn: 'bg-blue-600 text-white border-blue-500', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  orange: { btn: 'bg-orange-600 text-white border-orange-500', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  purple: { btn: 'bg-purple-600 text-white border-purple-500', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  green: { btn: 'bg-green-600 text-white border-green-500', badge: 'bg-green-500/10 text-green-400 border-green-500/30' },
}

function formatTime(sec) {
  if (!sec || isNaN(sec) || sec <= 0) return '-'
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(2).padStart(5, '0')
  return m > 0 ? `${m}:${s}` : `${s}`
}

function parseTime(str) {
  if (!str) return null
  str = str.trim()
  if (str.includes(':')) {
    const [m, s] = str.split(':')
    return parseFloat(m) * 60 + parseFloat(s)
  }
  return parseFloat(str)
}

// 랩 타임에 사용할 배율 곡선 생성
function buildMultipliers(n, strategy, spread) {
  const mults = []
  for (let i = 0; i < n; i++) {
    const pos = n <= 1 ? 0.5 : i / (n - 1) // 0 → 1
    let m
    if (strategy === 'even') {
      m = 1
    } else if (strategy === 'front') {
      // 전반 빠름: pos=0에서 가장 작음(빠름), pos=1에서 가장 큼(느림)
      m = (1 - spread) + 2 * spread * pos
    } else if (strategy === 'back') {
      // 후반 빠름: pos=0에서 가장 큼(느림), pos=1에서 가장 작음(빠름)
      m = (1 + spread) - 2 * spread * pos
    } else if (strategy === 'middle') {
      // 중반 빠름: pos=0.5에서 가장 작음(빠름), 양 끝에서 가장 큼(느림)
      m = 1 + spread - 2 * spread * (1 - Math.abs(2 * pos - 1))
    }
    mults.push(m)
  }
  // 정규화: 합계가 n이 되도록 → 평균 배율 = 1
  const sum = mults.reduce((a, b) => a + b, 0)
  return mults.map(m => m * n / sum)
}

// 랩 타임의 빠름/느림 색상 (평균 대비)
function lapColor(lapTime, avgLap) {
  const ratio = lapTime / avgLap
  if (ratio < 0.975) return 'text-green-400'
  if (ratio < 0.995) return 'text-green-300'
  if (ratio <= 1.005) return 'text-white'
  if (ratio <= 1.025) return 'text-orange-300'
  return 'text-red-400'
}

// 종목별 자연스러운 구간 분할 정의
function getSegmentDists(event) {
  const d = event.distance
  if (d === 100) return [50, 50]
  if (d === 200) return [50, 50, 50, 50]
  if (d === 400) return [100, 100, 100, 100]
  if (d === 800) return [200, 200, 200, 200]
  if (d === 1500) return [300, 300, 300, 300, 300]
  return [d / 2, d / 2]
}

function RaceAnalysis() {
  const [event, setEvent] = useState(EVENTS[4])
  const [times, setTimes] = useState([])
  const [result, setResult] = useState(null)

  const segments = getSegmentDists(event)

  // 종목 변경 시 입력 초기화
  const changeEvent = (ev) => {
    setEvent(ev)
    setTimes([])
    setResult(null)
  }

  const setTime = (i, v) => {
    const next = [...times]
    next[i] = v
    setTimes(next)
    setResult(null)
  }

  const analyze = () => {
    const secs = segments.map((_, i) => parseTime(times[i] || ''))
    if (secs.some(s => !s || s <= 0)) return

    const total = secs.reduce((a, b) => a + b, 0)
    const pacePer100 = secs.map((s, i) => s / segments[i] * 100)
    const avgPace = total / event.distance * 100
    const bestIdx = pacePer100.indexOf(Math.min(...pacePer100))
    const worstIdx = pacePer100.indexOf(Math.max(...pacePer100))

    // 구간 간 변화 (이전 구간 대비 delta)
    const deltas = secs.map((s, i) => {
      if (i === 0) return 0
      const prevPace = pacePer100[i - 1]
      const curPace = pacePer100[i]
      return curPace - prevPace // 양수 = 느려짐, 음수 = 빨라짐
    })

    // 전/중/후반 평균 페이스
    const n = segments.length
    const frontEnd = Math.floor(n / 3)
    const backStart = Math.ceil(n * 2 / 3)
    const phaseAvg = {
      front: pacePer100.slice(0, frontEnd).reduce((a, b) => a + b, 0) / frontEnd || 0,
      middle: pacePer100.slice(frontEnd, backStart).reduce((a, b) => a + b, 0) / (backStart - frontEnd) || 0,
      back: pacePer100.slice(backStart).reduce((a, b) => a + b, 0) / (n - backStart) || 0,
    }

    // 이상적 균등 페이스 대비 누적 손실
    const idealLapTime = total / n
    let cumLoss = 0
    const lossPerSeg = secs.map((s, i) => {
      const loss = s - idealLapTime
      cumLoss += loss
      return { loss, cumLoss }
    })

    setResult({ secs, total, pacePer100, avgPace, bestIdx, worstIdx, deltas, phaseAvg, lossPerSeg })
  }

  const allFilled = segments.every((_, i) => times[i] && parseTime(times[i]) > 0)

  return (
    <div>
      {/* 종목 선택 */}
      <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 mb-4">
        <label className="block text-xs text-slate-400 mb-2">종목</label>
        <div className="relative w-56">
          <select value={event.label} onChange={(e) => changeEvent(EVENTS.find(ev => ev.label === e.target.value))}
            className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none appearance-none">
            {EVENTS.map(ev => <option key={ev.label} value={ev.label}>{ev.label}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* 구간 입력 */}
      <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 mb-4">
        <p className="text-xs text-slate-400 mb-3">구간별 기록 입력 <span className="text-slate-600">({segments.length}구간 × {segments[0]}m)</span></p>
        <div className={`grid gap-3 ${segments.length <= 4 ? 'grid-cols-' + segments.length : 'grid-cols-5'}`}>
          {segments.map((dist, i) => {
            const cumDist = segments.slice(0, i + 1).reduce((a, b) => a + b, 0)
            return (
              <div key={i}>
                <label className="block text-[10px] text-slate-500 mb-1">
                  구간 {i + 1} <span className="text-slate-600">({cumDist}m)</span>
                </label>
                <TimeInput
                  value={times[i] || ''}
                  onChange={(v) => setTime(i, v)}
                  onKeyDown={(e) => e.key === 'Enter' && i === segments.length - 1 && analyze()}
                  placeholder={dist <= 100 ? '예: 5730' : '예: 12450'}
                  className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                />
              </div>
            )
          })}
        </div>
      </div>

      <button onClick={analyze} disabled={!allFilled}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-semibold px-6 py-2.5 rounded-lg transition mb-6">
        <BarChart2 size={16} /> 레이스 분석
      </button>

      {result && (
        <div className="space-y-4">
          {/* 총 기록 + 판정 */}
          <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-slate-400 mb-1">최종 기록</p>
                <p className="text-3xl font-bold text-white font-mono">{formatTime(result.total)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 mb-1">평균 100m 페이스</p>
                <p className="text-xl font-bold text-blue-400 font-mono">{formatTime(result.avgPace)}</p>
              </div>
            </div>
            {/* 전/중/후반 요약 */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '전반', avg: result.phaseAvg.front, emoji: '🟠' },
                { label: '중반', avg: result.phaseAvg.middle, emoji: '🟣' },
                { label: '후반', avg: result.phaseAvg.back, emoji: '🟢' },
              ].map(({ label, avg, emoji }) => {
                if (!avg) return null
                const diff = avg - result.avgPace
                const isFast = diff < -0.3
                const isSlow = diff > 0.3
                return (
                  <div key={label} className="bg-[#0f1117] rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-500">{emoji} {label} 100m 페이스</p>
                    <p className={`text-base font-bold font-mono mt-1 ${isFast ? 'text-green-400' : isSlow ? 'text-red-400' : 'text-white'}`}>
                      {formatTime(avg)}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${isFast ? 'text-green-500' : isSlow ? 'text-red-500' : 'text-slate-600'}`}>
                      {diff > 0.05 ? `+${diff.toFixed(2)}s 느림` : diff < -0.05 ? `${diff.toFixed(2)}s 빠름` : '평균'}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 구간별 상세 분석 */}
          <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
            <p className="text-xs text-slate-400 mb-4">구간별 분석</p>
            <div className="space-y-3">
              {segments.map((dist, i) => {
                const pace = result.pacePer100[i]
                const diff = pace - result.avgPace
                const isBest = i === result.bestIdx
                const isWorst = i === result.worstIdx
                const delta = result.deltas[i]
                const cumLoss = result.lossPerSeg[i].cumLoss
                const barWidth = Math.max(5, Math.min(100, 100 - (diff / result.avgPace * 100 * 15)))

                return (
                  <div key={i} className={`rounded-lg p-3 border ${isBest ? 'border-green-500/40 bg-green-500/5' : isWorst ? 'border-red-500/40 bg-red-500/5' : 'border-slate-700/30 bg-[#0f1117]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-300">구간 {i + 1}</span>
                        <span className="text-[10px] text-slate-600">{segments.slice(0, i + 1).reduce((a, b) => a + b, 0)}m</span>
                        {isBest && <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">🏆 최고</span>}
                        {isWorst && <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">⚠ 최저</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400 font-mono">{formatTime(result.secs[i])}</span>
                        <span className={`font-mono font-semibold ${diff < -0.3 ? 'text-green-400' : diff > 0.3 ? 'text-red-400' : 'text-white'}`}>
                          100m: {formatTime(pace)}
                        </span>
                      </div>
                    </div>
                    {/* 속도 바 */}
                    <div className="relative w-full bg-slate-700/30 rounded-full h-2 mb-1.5">
                      <div
                        className={`h-2 rounded-full transition-all ${isBest ? 'bg-green-500' : isWorst ? 'bg-red-500' : diff < 0 ? 'bg-green-400/70' : 'bg-orange-400/70'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>
                        평균 대비 {diff > 0.05 ? <span className="text-red-400">+{diff.toFixed(2)}s 느림</span> : diff < -0.05 ? <span className="text-green-400">{diff.toFixed(2)}s 빠름</span> : <span className="text-slate-500">동일</span>}
                      </span>
                      <div className="flex gap-3">
                        {i > 0 && (
                          <span>
                            이전 대비 {delta > 0.05 ? <span className="text-red-400">↓ {delta.toFixed(2)}s 감속</span> : delta < -0.05 ? <span className="text-green-400">↑ {Math.abs(delta).toFixed(2)}s 가속</span> : <span>유지</span>}
                          </span>
                        )}
                        <span className={`${cumLoss > 1 ? 'text-orange-400' : cumLoss < -0.5 ? 'text-green-400' : ''}`}>
                          누적 {cumLoss > 0 ? `+${cumLoss.toFixed(2)}s` : `${cumLoss.toFixed(2)}s`}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 종합 평가 */}
          <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
            <p className="text-xs font-semibold text-slate-400 mb-2">💡 레이스 총평</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              {(() => {
                const { phaseAvg, avgPace, worstIdx } = result
                const frontDiff = phaseAvg.front - avgPace
                const backDiff = phaseAvg.back - avgPace
                const midDiff = phaseAvg.middle - avgPace
                if (backDiff > 0.5 && frontDiff < 0) return `전반에 에너지를 많이 쓴 포지티브 스플릿 패턴입니다. 구간 ${worstIdx + 1}에서 가장 크게 감속되었습니다. 전반 페이스를 1~2% 아껴서 후반 유지력을 높이면 기록 단축이 가능합니다.`
                if (backDiff < -0.5) return `후반에 페이스를 올린 이상적인 네거티브 스플릿입니다. 후반 구간이 가장 빠르며 체력 분배가 훌륭합니다.`
                if (midDiff < -0.3 && frontDiff > 0.3 && backDiff > 0.3) return `중반에 기어를 올리는 패턴입니다. 전반 초반 흥분을 억제하고 중반부터 가속하는 흐름은 장거리에서 효과적입니다.`
                return `전 구간 고른 페이스를 유지했습니다. 구간 ${worstIdx + 1}이 가장 느린 구간으로, 해당 구간의 체력 분배를 집중적으로 보완하면 좋습니다.`
              })()}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PacePage() {
  const [tab, setTab] = useState('pace')
  const [event, setEvent] = useState(EVENTS[4])
  const [targetTime, setTargetTime] = useState('')
  const [poolType, setPoolType] = useState('50')
  const [strategy, setStrategy] = useState('even')
  const [intensity, setIntensity] = useState('medium')
  const [splits, setSplits] = useState(null)

  const calculate = () => {
    const totalSec = parseTime(targetTime)
    if (!totalSec || totalSec <= 0) return

    const lapDist = parseInt(poolType)
    const totalLaps = event.distance / lapDist
    const spread = strategy === 'even' ? 0 : SPREAD[intensity]
    const mults = buildMultipliers(totalLaps, strategy, spread)

    const rows = []
    let cumulative = 0
    for (let i = 0; i < totalLaps; i++) {
      const lapTime = mults[i] * (totalSec / totalLaps)
      cumulative += lapTime
      const distSoFar = (i + 1) * lapDist

      let stroke = null
      if (event.isIM) {
        const strokes = IM_STROKES[event.distance]
        const strokeIdx = Math.floor(distSoFar / (event.distance / strokes.length) - 0.001)
        stroke = strokes[Math.min(strokeIdx, strokes.length - 1)]
      }

      const phase = i < totalLaps / 3 ? 'front' : i < totalLaps * 2 / 3 ? 'middle' : 'back'
      rows.push({ lap: i + 1, dist: distSoFar, split: lapTime, cumulative, stroke, is100: distSoFar % 100 === 0, phase })
    }

    const avgLapSec = totalSec / totalLaps
    const per100 = avgLapSec * (100 / lapDist)

    // 전/중/후반 평균 페이스
    const phases = { front: [], middle: [], back: [] }
    rows.forEach(r => phases[r.phase].push(r.split))
    const phaseAvg = {
      front: phases.front.length ? phases.front.reduce((a, b) => a + b, 0) / phases.front.length : null,
      middle: phases.middle.length ? phases.middle.reduce((a, b) => a + b, 0) / phases.middle.length : null,
      back: phases.back.length ? phases.back.reduce((a, b) => a + b, 0) / phases.back.length : null,
    }

    setSplits({ rows, totalSec, avgLapSec, per100, totalLaps, lapDist, strategy, intensity, phaseAvg })
  }

  const activeStrategy = STRATEGIES.find(s => s.id === strategy)

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">페이스 계산기</h1>
        <p className="text-slate-400 text-sm mt-0.5">목표 기록 스플릿 계산 · 레이스 분석</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-[#1a1d27] p-1 rounded-lg border border-slate-700/50 w-fit">
        <button onClick={() => setTab('pace')}
          className={`text-sm px-4 py-2 rounded-md transition font-medium ${tab === 'pace' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
          페이스 계산기
        </button>
        <button onClick={() => setTab('race')}
          className={`text-sm px-4 py-2 rounded-md transition font-medium ${tab === 'race' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}>
          레이스 분석
        </button>
      </div>

      {tab === 'race' && <RaceAnalysis />}
      {tab === 'pace' && (
        <div>
          {/* 기본 설정 */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
              <label className="block text-xs text-slate-400 mb-2">종목</label>
              <div className="relative">
                <select
                  value={event.label}
                  onChange={(e) => { setEvent(EVENTS.find(ev => ev.label === e.target.value)); setSplits(null) }}
                  className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 appearance-none"
                >
                  {EVENTS.map(ev => <option key={ev.label} value={ev.label}>{ev.label}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
            <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
              <label className="block text-xs text-slate-400 mb-2">목표 기록</label>
              <TimeInput
                value={targetTime}
                onChange={(v) => { setTargetTime(v); setSplits(null) }}
                onKeyDown={(e) => e.key === 'Enter' && calculate()}
                placeholder="숫자만 예: 145200"
                className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
              <label className="block text-xs text-slate-400 mb-2">풀 사이즈</label>
              <div className="flex gap-2">
                {['50', '25'].map(p => (
                  <button key={p} onClick={() => { setPoolType(p); setSplits(null) }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${poolType === p ? 'bg-blue-600 text-white' : 'bg-[#0f1117] border border-slate-700 text-slate-400 hover:text-white'}`}>
                    {p}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 레이스 전략 선택 */}
          <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 mb-4">
            <p className="text-xs text-slate-400 mb-3">레이스 전략 타입</p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {STRATEGIES.map(s => {
                const Icon = s.icon
                const isActive = strategy === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => { setStrategy(s.id); setSplits(null) }}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-center transition ${
                      isActive
                        ? COLOR_MAP[s.color].btn + ' border-transparent'
                        : 'bg-[#0f1117] border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-xs font-semibold leading-tight">{s.label}</span>
                    <span className={`text-[10px] leading-tight ${isActive ? 'opacity-80' : 'text-slate-600'}`}>{s.sub}</span>
                  </button>
                )
              })}
            </div>
            {activeStrategy && (
              <p className="text-xs text-slate-500">{activeStrategy.desc}</p>
            )}
            {strategy !== 'even' && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-slate-500">강도:</span>
                {[
                  { id: 'light', label: '약 (±2.5%)', },
                  { id: 'medium', label: '중 (±5%)', },
                  { id: 'hard', label: '강 (±9%)', },
                ].map(i => (
                  <button key={i.id} onClick={() => { setIntensity(i.id); setSplits(null) }}
                    className={`text-xs px-3 py-1 rounded-full border transition ${
                      intensity === i.id
                        ? COLOR_MAP[activeStrategy.color].badge
                        : 'bg-transparent border-slate-700 text-slate-600 hover:text-slate-400'
                    }`}>
                    {i.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={calculate}
            disabled={!targetTime}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold px-6 py-2.5 rounded-lg transition mb-6"
          >
            <Calculator size={16} />
            스플릿 계산
          </button>

          {splits && (
            <div className="space-y-4">
              {/* 요약 카드 */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: '목표 기록', value: formatTime(splits.totalSec), color: 'text-blue-400' },
                  { label: '100m 페이스', value: formatTime(splits.per100), color: 'text-green-400' },
                  { label: `평균 ${splits.lapDist}m 랩`, value: formatTime(splits.avgLapSec), color: 'text-purple-400' },
                  { label: '총 랩 수', value: `${splits.totalLaps}회`, color: 'text-orange-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 text-center">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* 전/중/후반 페이스 요약 */}
              <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
                <p className="text-xs text-slate-400 mb-3">
                  구간별 평균 페이스
                  {splits.strategy !== 'even' && (
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] border ${COLOR_MAP[STRATEGIES.find(s => s.id === splits.strategy).color].badge}`}>
                      {STRATEGIES.find(s => s.id === splits.strategy).label} · {splits.intensity === 'light' ? '약' : splits.intensity === 'medium' ? '중' : '강'}
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'front', label: '전반', emoji: '🟠' },
                    { key: 'middle', label: '중반', emoji: '🟣' },
                    { key: 'back', label: '후반', emoji: '🟢' },
                  ].map(({ key, label, emoji }) => {
                    const avg = splits.phaseAvg[key]
                    const diff = avg ? avg - splits.avgLapSec : 0
                    const isFast = diff < -0.05
                    const isSlow = diff > 0.05
                    return (
                      <div key={key} className="bg-[#0f1117] rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-500 mb-1">{emoji} {label}</p>
                        <p className={`text-lg font-bold font-mono ${isFast ? 'text-green-400' : isSlow ? 'text-orange-400' : 'text-white'}`}>
                          {formatTime(avg)}
                        </p>
                        {avg && (
                          <p className={`text-[10px] mt-0.5 ${isFast ? 'text-green-500' : isSlow ? 'text-orange-500' : 'text-slate-600'}`}>
                            {diff > 0.005 ? `+${diff.toFixed(2)}s 느림` : diff < -0.005 ? `${diff.toFixed(2)}s 빠름` : '평균'}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 스플릿 테이블 */}
              <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/30">
                  <div className="flex items-center gap-2">
                    <Timer size={14} className="text-blue-400" />
                    <h2 className="text-sm font-semibold text-slate-300">구간별 스플릿</h2>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-600">
                    <span className="text-green-400">■</span> 빠름
                    <span className="text-white">■</span> 평균
                    <span className="text-orange-400">■</span> 느림
                    <span className="ml-2 text-yellow-400">■</span> 100m
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-700/30">
                        <th className="text-left px-5 py-2.5 font-medium">랩</th>
                        <th className="text-left px-4 py-2.5 font-medium">거리</th>
                        {event.isIM && <th className="text-left px-4 py-2.5 font-medium">영법</th>}
                        <th className="text-right px-4 py-2.5 font-medium">랩 타임</th>
                        <th className="text-right px-5 py-2.5 font-medium">누적 시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splits.rows.map((row) => (
                        <tr key={row.lap}
                          className={`border-b border-slate-700/20 last:border-0 transition ${row.is100 ? 'bg-yellow-500/5' : 'hover:bg-slate-700/10'}`}>
                          <td className="px-5 py-2.5">
                            <span className={`font-medium ${row.is100 ? 'text-yellow-400' : 'text-slate-400'}`}>{row.lap}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs ${row.is100 ? 'text-yellow-300 font-semibold' : 'text-slate-500'}`}>{row.dist}m</span>
                          </td>
                          {event.isIM && (
                            <td className="px-4 py-2.5">
                              <span className="text-xs text-slate-400">{row.stroke}</span>
                            </td>
                          )}
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-mono font-semibold ${lapColor(row.split, splits.avgLapSec)}`}>
                              {formatTime(row.split)}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            <span className={`font-mono font-semibold ${row.is100 ? 'text-yellow-400' : 'text-white'}`}>
                              {formatTime(row.cumulative)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
