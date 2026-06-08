import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain, Mail, Lock, User, ArrowRight, Loader2, CheckCircle2, Sparkles, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/authStore'

type Step = 'email' | 'code' | 'password' | 'consent'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [consents, setConsents] = useState({
    termsRequired: false,
    privacyRequired: false,
    marketingOptional: false,
    behaviorAnalyticsOptional: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const sendCode = async () => {
    setIsLoading(true)
    try {
      await authApi.requestEmailVerification(email, 'signup')
      toast.success('인증 코드를 발송했습니다')
      setStep('code')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || '발송 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const verifyCode = () => {
    if (code.length !== 6) { toast.error('6자리 코드를 입력하세요'); return }
    setStep('password')
  }

  const validatePassword = () => {
    if (password.length < 8) { toast.error('비밀번호는 8자 이상이어야 합니다'); return }
    if (password !== passwordConfirm) { toast.error('비밀번호가 일치하지 않습니다'); return }
    setStep('consent')
  }

  const handleSignup = async () => {
    if (!consents.termsRequired || !consents.privacyRequired) {
      toast.error('필수 약관에 동의해주세요')
      return
    }
    setIsLoading(true)
    try {
      await authApi.signup({ email, code, password, consents })
      await login(email, password)
      toast.success('가입 완료! BrainX에 오신 걸 환영해요 🚀')
      navigate('/')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || '가입 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const steps = ['이메일', '인증', '비밀번호', '약관']
  const stepIdx = ['email', 'code', 'password', 'consent'].indexOf(step)

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/3 right-1/3 w-80 h-80 bg-brand-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-1/3 w-64 h-64 bg-indigo-400/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md mx-4 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-500/20 rounded-xl border border-brand-500/30 mb-3 animate-glow">
            <Brain className="w-7 h-7 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold font-display text-white">BrainX 시작하기</h1>
          <p className="text-slate-400 text-sm mt-1 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-brand-400" /> 나만의 AI 지식 우주를 만들어요
          </p>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-all duration-300 ${
                i < stepIdx ? 'bg-brand-500 text-white' :
                i === stepIdx ? 'bg-brand-500/30 text-brand-300 border border-brand-500' :
                'bg-surface-hover text-slate-500'
              }`}>
                {i < stepIdx ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 h-px transition-colors duration-300 ${i < stepIdx ? 'bg-brand-500' : 'bg-surface-border'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="card p-8 shadow-2xl shadow-black/50">
          {step === 'email' && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <h2 className="text-lg font-semibold font-display text-white mb-1">이메일 입력</h2>
                <p className="text-slate-400 text-sm mb-4">인증 코드를 받을 이메일을 입력하세요</p>
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="input-base pl-9" placeholder="brain@example.com"
                  onKeyDown={e => e.key === 'Enter' && sendCode()} />
              </div>
              <button onClick={sendCode} disabled={!email || isLoading} className="btn-primary w-full justify-center">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isLoading ? '발송 중...' : '인증 코드 발송'}
              </button>
            </div>
          )}

          {step === 'code' && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <h2 className="text-lg font-semibold font-display text-white mb-1">이메일 인증</h2>
                <p className="text-slate-400 text-sm mb-4"><span className="text-brand-300">{email}</span>로 발송된 6자리 코드를 입력하세요</p>
              </div>
              <input type="text" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input-base text-center text-2xl tracking-[0.5em] font-mono" placeholder="000000"
                maxLength={6} onKeyDown={e => e.key === 'Enter' && verifyCode()} />
              <button onClick={verifyCode} disabled={code.length !== 6} className="btn-primary w-full justify-center">
                <CheckCircle2 className="w-4 h-4" /> 확인
              </button>
              <button onClick={() => setStep('email')} className="btn-ghost w-full justify-center text-sm">이메일 변경</button>
            </div>
          )}

          {step === 'password' && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <h2 className="text-lg font-semibold font-display text-white mb-1">비밀번호 설정</h2>
                <p className="text-slate-400 text-sm mb-4">8자 이상의 비밀번호를 입력하세요</p>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="input-base pl-9" placeholder="비밀번호 (8자 이상)" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)}
                  className="input-base pl-9" placeholder="비밀번호 확인"
                  onKeyDown={e => e.key === 'Enter' && validatePassword()} />
              </div>
              {/* 강도 표시 */}
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    password.length >= i * 3 ? i <= 2 ? 'bg-red-400' : i === 3 ? 'bg-yellow-400' : 'bg-green-400'
                    : 'bg-surface-border'
                  }`} />
                ))}
              </div>
              <button onClick={validatePassword} className="btn-primary w-full justify-center">
                <ArrowRight className="w-4 h-4" /> 다음
              </button>
            </div>
          )}

          {step === 'consent' && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <h2 className="text-lg font-semibold font-display text-white mb-1">약관 동의</h2>
                <p className="text-slate-400 text-sm mb-4">서비스 이용을 위한 약관에 동의해 주세요</p>
              </div>
              {[
                { key: 'termsRequired', label: '이용약관 동의', required: true },
                { key: 'privacyRequired', label: '개인정보 처리방침 동의', required: true },
                { key: 'marketingOptional', label: '마케팅 정보 수신 동의', required: false },
                { key: 'behaviorAnalyticsOptional', label: '행동 분석 데이터 수집 동의', required: false },
              ].map(({ key, label, required }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
                    consents[key as keyof typeof consents]
                      ? 'bg-brand-500 border-brand-500'
                      : 'border-surface-border group-hover:border-brand-500/50'
                  }`} onClick={() => setConsents(prev => ({ ...prev, [key]: !prev[key as keyof typeof consents] }))}>
                    {consents[key as keyof typeof consents] && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm text-slate-300">
                    {label}
                    {required && <span className="text-red-400 ml-1">*</span>}
                    {!required && <span className="text-slate-500 ml-1">(선택)</span>}
                  </span>
                </label>
              ))}
              <button onClick={handleSignup} disabled={isLoading || !consents.termsRequired || !consents.privacyRequired}
                className="btn-primary w-full justify-center mt-2">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isLoading ? '가입 중...' : 'BrainX 시작하기'}
              </button>
            </div>
          )}

          <p className="text-center text-sm text-slate-500 mt-6">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">로그인</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
