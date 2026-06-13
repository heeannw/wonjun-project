import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const signIn = useAuthStore((s) => s.signIn)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
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
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          원준 선수 전용 플랫폼 · Private
        </p>
      </div>
    </div>
  )
}
