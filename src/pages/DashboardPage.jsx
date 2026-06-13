import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { Flame, Moon, Activity, Target } from 'lucide-react'

const OLYMPIC_TARGETS = {
  '자유형 400m':  { target: '3:43.00', pb: '3:49.49', pbSec: 229.49, targetSec: 223.0 },
  '자유형 1500m': { target: '14:52.00', pb: '15:13.36', pbSec: 913.36, targetSec: 892.0 },
  '자유형 800m':  { target: '7:50.00', pb: '7:59.91', pbSec: 479.91, targetSec: 470.0 },
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/10',
    green: 'text-green-400 bg-green-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
  }
  return (
    <div className="bg-[#1a1d27] rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon size={16} className={colors[color].split(' ')[0]} />
        </div>
        <span className="text-slate-400 text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLogs = async () => {
      const { data } = await supabase
        .from('training_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(30)
      setLogs(data || [])
      setLoading(false)
    }
    fetchLogs()
  }, [user.id])

  const recentLogs = logs.slice(0, 7)
  const avgRpe = recentLogs.length
    ? (recentLogs.reduce((s, l) => s + (l.rpe || 0), 0) / recentLogs.length).toFixed(1)
    : '-'
  const avgSleep = recentLogs.length
    ? (recentLogs.reduce((s, l) => s + (l.sleep_hours || 0), 0) / recentLogs.length).toFixed(1)
    : '-'
  const totalDistThisWeek = recentLogs
    .slice(0, 7)
    .reduce((s, l) => s + (l.total_distance_m || 0), 0)

  const chartData = [...logs].reverse().slice(-14).map((l) => ({
    date: l.date?.slice(5),
    거리: l.total_distance_m,
    RPE: l.rpe,
    컨디션: l.condition_score,
  }))

  // Days until 2028 LA Olympics (July 14, 2028)
  const daysLeft = Math.ceil((new Date('2028-07-14') - new Date()) / (1000 * 60 * 60 * 24))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">대시보드</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          2028 LA 올림픽까지 <span className="text-blue-400 font-semibold">{daysLeft}일</span> 남았습니다
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Activity} label="이번 주 거리" value={`${totalDistThisWeek.toLocaleString()}m`} sub="최근 7일" color="blue" />
        <StatCard icon={Flame} label="평균 RPE" value={avgRpe} sub="최근 7일" color="orange" />
        <StatCard icon={Moon} label="평균 수면" value={`${avgSleep}h`} sub="최근 7일" color="purple" />
        <StatCard icon={Target} label="D-Day" value={`D-${daysLeft}`} sub="2028 LA 올림픽" color="green" />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">훈련 추이 (최근 2주)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1d27', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line type="monotone" dataKey="거리" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="RPE" stroke="#f97316" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="컨디션" stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Olympic Gap */}
      <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">올림픽 기준 기록 Gap</h2>
        <div className="space-y-3">
          {Object.entries(OLYMPIC_TARGETS).map(([event, { target, pb, pbSec, targetSec }]) => {
            const gapSec = pbSec - targetSec
            const pct = Math.max(0, Math.min(100, ((pbSec - targetSec) / pbSec) * 100 * 10))
            return (
              <div key={event}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300">{event}</span>
                  <span className="text-slate-400">
                    PB {pb} → 목표 {target}
                    <span className="text-orange-400 ml-2">-{gapSec.toFixed(2)}초</span>
                  </span>
                </div>
                <div className="w-full bg-slate-700/40 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full"
                    style={{ width: `${100 - Math.min(100, (gapSec / pbSec) * 1000)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent logs */}
      <div className="bg-[#1a1d27] rounded-xl p-5 border border-slate-700/50">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">최근 훈련 일지</h2>
        {loading ? (
          <p className="text-slate-500 text-sm">불러오는 중...</p>
        ) : logs.length === 0 ? (
          <p className="text-slate-500 text-sm">아직 기록된 훈련이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <div>
                  <p className="text-sm text-white">{log.date}</p>
                  <p className="text-xs text-slate-500">{log.main_event || '자유형'}</p>
                </div>
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>{log.total_distance_m}m</span>
                  <span>RPE {log.rpe}</span>
                  <span>수면 {log.sleep_hours}h</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
