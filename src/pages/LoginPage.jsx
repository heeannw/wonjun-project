import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, ClipboardCheck } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginType, setLoginType] = useState('athlete')
  const signIn = useAuthStore((s) => s.signIn)
  const signOut = useAuthStore((s) => s.signOut)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await signIn(email, password)
      const actualRole = result.appProfile?.role
      if (actualRole && actualRole !== loginType) {
        await signOut()
        setError(actualRole === 'coach'
          ? '이 계정은 코치 계정입니다. 코치 로그인 탭을 선택해주세요.'
          : '이 계정은 선수 계정입니다. 선수 로그인 탭을 선택해주세요.')
        return
      }
      localStorage.setItem('wonjun-login-type', loginType)
      navigate(loginType === 'coach' ? '/coach' : '/')
    } catch (err) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏊</div>
          <h1 className="text-2xl font-bold text-white">WONJUN PROJECT</h1>
          <p className="text-slate-400 text-sm mt-1">2028 LA 올림픽을 향한 성장 플랫폼</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#1a1d27] rounded-2xl p-6 shadow-xl border border-slate-700/50">
          <div className="grid grid-cols-2 gap-2 mb-5 bg-[#0f1117] border border-slate-700/50 rounded-xl p-1">
            {[
              { id: 'athlete', label: '선수 로그인', icon: User },
              { id: 'coach', label: '코치 로그인', icon: ClipboardCheck },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setLoginType(id)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  loginType === id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/40'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          <div className="mb-5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
            <p className="text-xs text-blue-300 leading-relaxed">
              {loginType === 'athlete'
                ? '선수 계정으로 훈련 기록을 입력하고 성장 흐름을 확인합니다.'
                : '코치 계정으로 연결된 선수의 상태, 위험 신호, 코칭 체크포인트를 확인합니다.'}
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-1.5">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
              placeholder="이메일 입력"
              required
            />
          </div>
          <div className="mb-5">
            <label className="block text-sm text-slate-400 mb-1.5">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0f1117] border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
              placeholder="비밀번호 입력"
              required
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition"
          >
            {loading ? '로그인 중...' : loginType === 'coach' ? '코치로 로그인' : '선수로 로그인'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          원준 프로젝트 · Private
        </p>
      </div>
    </div>
  )
}
