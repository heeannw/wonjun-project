import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuthStore } from './store/authStore'
import { useProfileStore } from './store/profileStore'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import TrainingPage from './pages/TrainingPage'
import RecordsPage from './pages/RecordsPage'
import MentalPage from './pages/MentalPage'
import PlanPage from './pages/PlanPage'
import CompetitionPage from './pages/CompetitionPage'
import ReportPage from './pages/ReportPage'
import BodyPage from './pages/BodyPage'
import PacePage from './pages/PacePage'
import StrengthPage from './pages/StrengthPage'
import ProfilePage from './pages/ProfilePage'

function PrivateRoute({ children }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-slate-400">로딩 중...</div>
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  const { setUser, setLoading } = useAuthStore()
  const { fetchProfile } = useProfileStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <BrowserRouter basename="/wonjun-project">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/training" element={<PrivateRoute><TrainingPage /></PrivateRoute>} />
        <Route path="/records" element={<PrivateRoute><RecordsPage /></PrivateRoute>} />
        <Route path="/mental" element={<PrivateRoute><MentalPage /></PrivateRoute>} />
        <Route path="/routines" element={<Navigate to="/plan" replace />} />
        <Route path="/plan" element={<PrivateRoute><PlanPage /></PrivateRoute>} />
        <Route path="/competitions" element={<PrivateRoute><CompetitionPage /></PrivateRoute>} />
        <Route path="/body" element={<PrivateRoute><BodyPage /></PrivateRoute>} />
        <Route path="/report" element={<PrivateRoute><ReportPage /></PrivateRoute>} />
        <Route path="/pace" element={<PrivateRoute><PacePage /></PrivateRoute>} />
        <Route path="/strength" element={<PrivateRoute><StrengthPage /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
