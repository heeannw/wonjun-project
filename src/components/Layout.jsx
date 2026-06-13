import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Trophy, Brain, LogOut } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '대시보드' },
  { to: '/training', icon: BookOpen, label: '훈련 일지' },
  { to: '/records', icon: Trophy, label: 'PB 기록' },
  { to: '/mental', icon: Brain, label: '멘탈 일지' },
]

export default function Layout({ children }) {
  const signOut = useAuthStore((s) => s.signOut)
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[#1a1d27] border-r border-slate-700/50 flex flex-col fixed h-full">
        <div className="p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏊</span>
            <div>
              <p className="text-white font-bold text-sm leading-tight">WONJUN</p>
              <p className="text-slate-500 text-xs">2028 LA 올림픽</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3">
          {navItems.map(({ to, icon: Icon, label }) => (
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
          ))}
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
      <main className="ml-56 flex-1 p-6 min-h-screen">
        {children}
      </main>
    </div>
  )
}
