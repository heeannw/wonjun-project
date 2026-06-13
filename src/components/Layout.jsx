import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Trophy, Brain, CalendarDays, Swords, FileText, Scale, LogOut, Timer, Dumbbell, UserCircle, Moon, Sun, ClipboardCheck, AlertTriangle, BarChart3, MessageSquare, ListChecks } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '대시보드' },
  { to: '/training', icon: BookOpen, label: '훈련 일지' },
  { to: '/records', icon: Trophy, label: 'PB 기록' },
  { to: '/mental', icon: Brain, label: '멘탈 일지' },
  { to: '/plan', icon: CalendarDays, label: '월간 일정' },
  { to: '/competitions', icon: Swords, label: '시합 일정' },
  { to: '/body', icon: Scale, label: '신체 기록' },
  { to: '/pace', icon: Timer, label: '페이스 계산기' },
  { to: '/strength', icon: Dumbbell, label: '근력 기록' },
  { to: '/report', icon: FileText, label: '월간 리포트' },
  { to: '/profile', icon: UserCircle, label: '선수 정보' },
  { to: '/coach', icon: ClipboardCheck, label: '코치 보드' },
]

const coachNavItems = [
  { id: 'coach-overview', icon: ClipboardCheck, label: '코치 홈' },
  { id: 'coach-status', icon: BarChart3, label: '선수 상태' },
  { id: 'coach-risk', icon: AlertTriangle, label: '위험 신호' },
  { id: 'coach-checkpoints', icon: ListChecks, label: '체크포인트' },
  { id: 'coach-race', icon: Trophy, label: '시합 분석' },
  { id: 'coach-report', icon: FileText, label: '월간 리포트' },
  { id: 'coach-inputs', icon: Brain, label: '입력 현황' },
  { id: 'coach-notes', icon: MessageSquare, label: '코치 메모' },
]

export default function Layout({ children }) {
  const signOut = useAuthStore((s) => s.signOut)
  const role = useAuthStore((s) => s.role)
  const navigate = useNavigate()
  const location = useLocation()
  const [theme, setTheme] = useState(() => localStorage.getItem('wonjun-theme') || 'dark')
  const showThemeToggle = location.pathname === '/' || location.pathname === '/coach'
  const visibleNavItems = role === 'coach'
    ? navItems.filter((item) => item.to === '/coach')
    : navItems.filter((item) => item.to !== '/coach')

  const scrollToCoachSection = (id) => {
    if (location.pathname !== '/coach') {
      navigate('/coach')
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
      return
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('wonjun-theme', theme)
  }, [theme])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-[#1a1d27]/95 backdrop-blur border-b border-slate-700/50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl shrink-0">🏊</span>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight">WONJUNE</p>
              <p className="text-slate-500 text-xs truncate">2028 LA 올림픽</p>
            </div>
          </div>
          {showThemeToggle && (
            <button
              type="button"
              onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-[#0f1117] px-3 py-2 text-xs font-semibold text-slate-300 transition theme-toggle shrink-0"
              title={theme === 'dark' ? '화이트 버전으로 변경' : '블랙 버전으로 변경'}
            >
              {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
              {theme === 'dark' ? '블랙' : '화이트'}
            </button>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <aside className="hidden md:flex w-56 bg-[#1a1d27] border-r border-slate-700/50 flex-col fixed h-full">
        <div className="p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏊</span>
            <div>
              <p className="text-white font-bold text-sm leading-tight">WONJUNE</p>
              <p className="text-slate-500 text-xs">2028 LA 올림픽</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3">
          {role === 'coach' ? (
            <>
              <p className="px-3 mb-2 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Coach Board</p>
              {coachNavItems.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => scrollToCoachSection(id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition w-full text-left text-slate-400 hover:bg-slate-700/40 hover:text-white"
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </>
          ) : (
            visibleNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 font-medium'
                      : 'text-slate-400 hover:bg-slate-700/40 hover:text-white'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))
          )}
        </nav>

        <div className="p-3 border-t border-slate-700/50">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-slate-400 hover:bg-slate-700/40 hover:text-white transition"
          >
            <LogOut size={18} />
            로그아웃
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="w-full md:ml-56 flex-1 px-4 py-5 pt-20 pb-24 md:p-6 md:min-h-screen overflow-x-hidden">
        {showThemeToggle && (
          <button
            type="button"
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            className="hidden md:flex fixed right-6 top-5 z-40 items-center gap-2 rounded-full border border-slate-700/50 bg-[#1a1d27] px-3 py-2 text-xs font-semibold text-slate-300 shadow-lg transition hover:border-blue-500/50 hover:text-white theme-toggle"
            title={theme === 'dark' ? '화이트 버전으로 변경' : '블랙 버전으로 변경'}
          >
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            {theme === 'dark' ? '블랙' : '화이트'}
          </button>
        )}
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1a1d27]/95 backdrop-blur border-t border-slate-700/50 px-2 py-2">
        <div className="flex gap-1 overflow-x-auto mobile-nav-scroll pb-1">
          {(role === 'coach' ? coachNavItems : visibleNavItems).map(({ to, id, icon: Icon, label }) => (
            <NavLink
              key={to || id}
              to={to || '/coach'}
              end={to === '/'}
              onClick={(event) => {
                if (id) {
                  event.preventDefault()
                  scrollToCoachSection(id)
                }
              }}
              className={({ isActive }) =>
                `flex min-w-[72px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] transition ${
                  isActive && !id
                    ? 'bg-blue-600/20 text-blue-400 font-semibold'
                    : 'text-slate-400'
                }`
              }
            >
              <Icon size={17} />
              <span className="whitespace-nowrap">{label.replace(' ', '')}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
