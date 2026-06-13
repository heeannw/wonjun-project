import { useState } from 'react'
import { Timer, Calculator, ChevronDown, BarChart2 } from 'lucide-react'

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

function RaceAnalysis() {
  const [event, setEvent] = useState(EVENTS[4])
  const [frontTime, setFrontTime] = useState('')
  const [backTime, setBackTime] = useState('')
  const [result, setResult] = useState(null)

  const analyze = () => {
    const front = parseTime(frontTime)
    const back = parseTime(backTime)
    if (!front || !back) return
    const total = front + back
    const ratio = (back / front) * 100
    const per100Front = front / (event.distance / 2) * 100
    const per100Back = back / (event.distance / 2) * 100
    const isNegative = back < front
    const diff = Math.abs(front - back)
    setResult({ front, back, total, ratio, per100Front, per100Back, isNegative, diff })
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
          <label className="block text-xs text-slate-400 mb-2">종목</label>
          <div className="relative">
            <select value={event.label} onChange={(e) => { setEvent(EVENTS.find(ev => ev.label === e.target.value)); setResult(null) }}
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none appearance-none">
              {EVENTS.map(ev => <option key={ev.label} value={ev.label}>{ev.label}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>
        <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
          <label className="block text-xs text-slate-400 mb-2">전반 {event.distance / 2}m</label>
          <input type="text" value={frontTime} onChange={(e) => { setFrontTime(e.target.value); setResult(null) }}
            placeholder="예: 7:24.50" onKeyDown={(e) => e.key === 'Enter' && analyze()}
            className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
          <label className="block text-xs text-slate-400 mb-2">후반 {event.distance / 2}m</label>
          <input type="text" value={backTime} onChange={(e) => { setBackTime(e.target.value); setResult(null) }}
            placeholder="예: 7:27.50" onKeyDown={(e) => e.key === 'Enter' && analyze()}
            className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      <button onClick={analyze} disabled={!frontTime || !backTime}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold px-6 py-2.5 rounded-lg transition mb-6">
        <BarChart2 size={16} /> 레이스 분석
      </button>

      {result && (
        <div className="space-y-4">
          {/* 총합 + 판정 */}
          <div className={`rounded-xl p-5 border ${result.isNegative ? 'bg-green-500/10 border-green-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">최종 기록</p>
                <p className="text-3xl font-bold text-white font-mono">{formatTime(result.total)}</p>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${result.isNegative ? 'text-green-400' : 'text-orange-400'}`}>
                  {result.isNegative ? '✓ 네거티브 스플릿' : '△ 포지티브 스플릿'}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  전반 대비 후반 {result.isNegative ? '-' : '+'}{formatTime(result.diff)} {result.isNegative ? '빠름' : '느림'}
                </p>
              </div>
            </div>
          </div>

          {/* 전/후반 비교 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
              <p className="text-xs text-slate-500 mb-1">전반 {event.distance / 2}m</p>
              <p className="text-2xl font-bold text-orange-400 font-mono">{formatTime(result.front)}</p>
              <p className="text-xs text-slate-500 mt-2">100m 페이스: <span className="text-white">{formatTime(result.per100Front)}</span></p>
            </div>
            <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
              <p className="text-xs text-slate-500 mb-1">후반 {event.distance / 2}m</p>
              <p className={`text-2xl font-bold font-mono ${result.isNegative ? 'text-green-400' : 'text-red-400'}`}>{formatTime(result.back)}</p>
              <p className="text-xs text-slate-500 mt-2">100m 페이스: <span className="text-white">{formatTime(result.per100Back)}</span></p>
            </div>
          </div>

          {/* 페이스 유지율 */}
          <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
            <p className="text-xs text-slate-400 mb-3">페이스 유지율 (후반/전반 비율)</p>
            <div className="flex items-center gap-4">
              <p className={`text-4xl font-bold ${result.ratio <= 100.5 ? 'text-green-400' : result.ratio <= 102 ? 'text-yellow-400' : 'text-red-400'}`}>
                {result.ratio.toFixed(1)}%
              </p>
              <div className="flex-1">
                <div className="w-full bg-slate-700/40 rounded-full h-3">
                  <div className={`h-3 rounded-full transition-all ${result.ratio <= 100.5 ? 'bg-green-500' : result.ratio <= 102 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, result.ratio - 95)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-slate-600 mt-1">
                  <span>이상적 (≤100%)</span><span>보통 (~102%)</span><span>후반 크랙 (≥103%)</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              {result.ratio <= 100 ? '완벽한 네거티브 스플릿! 엘리트 페이싱.' :
               result.ratio <= 101 ? '매우 훌륭한 페이스 유지. 올림픽 수준의 레이스 운영.' :
               result.ratio <= 102 ? '준수한 페이스. 후반 집중력을 조금 더 유지하면 기록 향상 가능.' :
               '후반 크랙 발생. 전반 페이스를 2~3% 낮추고 후반에 치고 나오는 훈련 필요.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PacePage() {
  const [tab, setTab] = useState('pace')
  const [event, setEvent] = useState(EVENTS[4]) // 자유형 1500m
  const [targetTime, setTargetTime] = useState('')
  const [poolType, setPoolType] = useState('50')
  const [splits, setSplits] = useState(null)

  const calculate = () => {
    const totalSec = parseTime(targetTime)
    if (!totalSec || totalSec <= 0) return

    const lapDist = parseInt(poolType) // 50m or 25m
    const totalLaps = event.distance / lapDist
    const secPerLap = totalSec / totalLaps

    const rows = []
    for (let i = 1; i <= totalLaps; i++) {
      const cumulative = secPerLap * i
      const distSoFar = i * lapDist

      let stroke = null
      if (event.isIM) {
        const strokes = IM_STROKES[event.distance]
        const strokeIdx = Math.floor((distSoFar - 1) / (event.distance / strokes.length))
        stroke = strokes[Math.min(strokeIdx, strokes.length - 1)]
      }

      rows.push({
        lap: i,
        dist: distSoFar,
        split: secPerLap,
        cumulative,
        stroke,
        is100: distSoFar % 100 === 0,
      })
    }
    setSplits({ rows, totalSec, secPerLap, totalLaps, lapDist })
  }

  const per100 = splits ? splits.secPerLap * (100 / parseInt(poolType)) : null

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
      {tab === 'pace' && <div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* 종목 */}
        <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
          <label className="block text-xs text-slate-400 mb-2">종목</label>
          <div className="relative">
            <select
              value={event.label}
              onChange={(e) => {
                const found = EVENTS.find(ev => ev.label === e.target.value)
                setEvent(found)
                setSplits(null)
              }}
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 appearance-none"
            >
              {EVENTS.map(ev => (
                <option key={ev.label} value={ev.label}>{ev.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* 목표 기록 */}
        <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
          <label className="block text-xs text-slate-400 mb-2">목표 기록</label>
          <input
            type="text"
            value={targetTime}
            onChange={(e) => { setTargetTime(e.target.value); setSplits(null) }}
            onKeyDown={(e) => e.key === 'Enter' && calculate()}
            placeholder="예: 14:52.00"
            className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-slate-600 mt-1">m:ss.xx 또는 ss.xx</p>
        </div>

        {/* 풀 사이즈 */}
        <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
          <label className="block text-xs text-slate-400 mb-2">풀 사이즈</label>
          <div className="flex gap-2">
            {['50', '25'].map(p => (
              <button
                key={p}
                onClick={() => { setPoolType(p); setSplits(null) }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${poolType === p ? 'bg-blue-600 text-white' : 'bg-[#0f1117] border border-slate-700 text-slate-400 hover:text-white'}`}
              >
                {p}m
              </button>
            ))}
          </div>
        </div>
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
              { label: '100m 페이스', value: formatTime(per100), color: 'text-green-400' },
              { label: `${poolType}m 랩 타임`, value: formatTime(splits.secPerLap), color: 'text-purple-400' },
              { label: '총 랩 수', value: `${splits.totalLaps}회`, color: 'text-orange-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50 text-center">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* 스플릿 테이블 */}
          <div className="bg-[#1a1d27] rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700/30">
              <Timer size={14} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-300">구간별 스플릿</h2>
              <span className="text-xs text-slate-500 ml-1">— 노란색: 100m 구간</span>
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
                    <tr
                      key={row.lap}
                      className={`border-b border-slate-700/20 last:border-0 transition ${row.is100 ? 'bg-yellow-500/5' : 'hover:bg-slate-700/10'}`}
                    >
                      <td className="px-5 py-2.5">
                        <span className={`font-medium ${row.is100 ? 'text-yellow-400' : 'text-slate-400'}`}>
                          {row.lap}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs ${row.is100 ? 'text-yellow-300 font-semibold' : 'text-slate-500'}`}>
                          {row.dist}m
                        </span>
                      </td>
                      {event.isIM && (
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-slate-400">{row.stroke}</span>
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-slate-300 font-mono">{formatTime(row.split)}</span>
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

          {/* 네거티브 스플릿 제안 */}
          <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
            <p className="text-xs font-semibold text-slate-400 mb-2">💡 네거티브 스플릿 전략 (전반 +2% / 후반 -2%)</p>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-slate-500 text-xs">전반 {event.distance / 2}m 목표</span>
                <p className="text-orange-400 font-semibold font-mono">{formatTime(splits.totalSec / 2 * 1.02)}</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">후반 {event.distance / 2}m 목표</span>
                <p className="text-green-400 font-semibold font-mono">{formatTime(splits.totalSec / 2 * 0.98)}</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">전반 100m 페이스</span>
                <p className="text-orange-300 font-semibold font-mono">{formatTime(per100 * 1.02)}</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">후반 100m 페이스</span>
                <p className="text-green-300 font-semibold font-mono">{formatTime(per100 * 0.98)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>}
    </div>
  )
}
