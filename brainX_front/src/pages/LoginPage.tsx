import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain, Mail, Lock, ArrowRight, Loader2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, isLoading } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
      toast.success('환영합니다!')
      navigate('/')
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || '로그인에 실패했습니다'
      toast.error(msg)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* 배경 글로우 */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />
        {/* 별 파티클 */}
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-0.5 bg-slate-400 rounded-full animate-pulse-slow"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              opacity: Math.random() * 0.5 + 0.1,
            }}
          />
        ))}
      </div>

      <div className="relative w-full max-w-md mx-4 animate-fade-in">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-500/20 rounded-2xl border border-brand-500/30 mb-4 animate-glow">
            <Brain className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-3xl font-bold font-display text-white">BrainX</h1>
          <p className="text-slate-400 text-sm mt-1 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-brand-400" />
            AI 지식 탐험 플랫폼
          </p>
        </div>

        {/* 카드 */}
        <div className="card p-8 shadow-2xl shadow-black/50">
          <h2 className="text-xl font-semibold font-display text-white mb-1">로그인</h2>
          <p className="text-slate-400 text-sm mb-6">나만의 지식 우주로 돌아오세요</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">이메일</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-base pl-9"
                  placeholder="brain@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">비밀번호</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-base pl-9"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center mt-2">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            계정이 없으신가요?{' '}
            <Link to="/signup" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
