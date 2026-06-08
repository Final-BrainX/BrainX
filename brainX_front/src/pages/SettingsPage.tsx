import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Lock, Shield, Trash2, Loader2, CheckCircle2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { authApi } from '../api/auth'
import Sidebar from '../components/layout/Sidebar'

type Tab = 'profile' | 'security' | 'consent' | 'danger'

export default function SettingsPage() {
  const { user, fetchMe, logout } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('profile')
  const [isLoading, setIsLoading] = useState(false)

  // Profile
  const [nickname, setNickname] = useState(user?.profile?.nickname || '')

  // Password
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')

  // Consents
  const [consents, setConsents] = useState({
    termsRequired: user?.consents?.termsRequired ?? true,
    privacyRequired: user?.consents?.privacyRequired ?? true,
    marketingOptional: user?.consents?.marketingOptional ?? false,
    behaviorAnalyticsOptional: user?.consents?.behaviorAnalyticsOptional ?? false,
  })

  const handleUpdateProfile = async () => {
    setIsLoading(true)
    try {
      await authApi.updateProfile({ nickname })
      await fetchMe()
      toast.success('프로필이 업데이트되었습니다')
    } catch {
      toast.error('프로필 업데이트 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) { toast.error('비밀번호가 일치하지 않습니다'); return }
    if (newPw.length < 8) { toast.error('8자 이상의 비밀번호를 입력하세요'); return }
    setIsLoading(true)
    try {
      await authApi.changePassword(currentPw, newPw)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      toast.success('비밀번호가 변경되었습니다. 다시 로그인해주세요')
      await logout()
      navigate('/login')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || '비밀번호 변경 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateConsents = async () => {
    setIsLoading(true)
    try {
      await authApi.updateConsents(consents)
      toast.success('동의 설정이 저장되었습니다')
    } catch {
      toast.error('동의 설정 저장 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestDeletion = async () => {
    if (!confirm('계정 삭제를 요청하시겠습니까? 30일 후 영구 삭제됩니다.')) return
    setIsLoading(true)
    try {
      await authApi.requestDeletion()
      toast.success('계정 삭제가 예약되었습니다. 30일 내에 취소 가능합니다')
      await logout()
      navigate('/login')
    } catch {
      toast.error('계정 삭제 요청 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const tabs = [
    { id: 'profile' as Tab, label: '프로필', icon: User },
    { id: 'security' as Tab, label: '보안', icon: Lock },
    { id: 'consent' as Tab, label: '동의 관리', icon: Shield },
    { id: 'danger' as Tab, label: '계정 삭제', icon: Trash2 },
  ]

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          {/* 헤더 */}
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => navigate('/')} className="btn-ghost">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-xl font-bold font-display text-white">설정</h1>
          </div>

          {/* 탭 */}
          <div className="flex gap-1 mb-6 bg-surface-card rounded-xl p-1 border border-surface-border">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  tab === id
                    ? 'bg-brand-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-surface-hover'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* 프로필 */}
          {tab === 'profile' && (
            <div className="card space-y-4 animate-fade-in">
              <h2 className="font-semibold font-display text-white">프로필 설정</h2>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">이메일</label>
                <input value={user?.email || ''} readOnly className="input-base opacity-60 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">닉네임</label>
                <input
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  className="input-base"
                  placeholder="닉네임을 입력하세요"
                  maxLength={50}
                />
              </div>
              <button onClick={handleUpdateProfile} disabled={isLoading} className="btn-primary">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                저장
              </button>
            </div>
          )}

          {/* 보안 */}
          {tab === 'security' && (
            <div className="card space-y-4 animate-fade-in">
              <h2 className="font-semibold font-display text-white">비밀번호 변경</h2>
              {[
                { label: '현재 비밀번호', val: currentPw, set: setCurrentPw, ph: '현재 비밀번호' },
                { label: '새 비밀번호', val: newPw, set: setNewPw, ph: '8자 이상' },
                { label: '새 비밀번호 확인', val: confirmPw, set: setConfirmPw, ph: '비밀번호 재입력' },
              ].map(({ label, val, set, ph }) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
                  <input type="password" value={val} onChange={e => set(e.target.value)}
                    className="input-base" placeholder={ph} />
                </div>
              ))}
              <button onClick={handleChangePassword} disabled={isLoading || !currentPw || !newPw} className="btn-primary">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                비밀번호 변경
              </button>
            </div>
          )}

          {/* 동의 관리 */}
          {tab === 'consent' && (
            <div className="card space-y-4 animate-fade-in">
              <h2 className="font-semibold font-display text-white">동의 관리</h2>
              <p className="text-sm text-slate-400">언제든지 선택적 동의를 변경할 수 있습니다</p>
              {[
                { key: 'termsRequired', label: '이용약관 동의', required: true },
                { key: 'privacyRequired', label: '개인정보 처리방침 동의', required: true },
                { key: 'marketingOptional', label: '마케팅 정보 수신 동의', required: false },
                { key: 'behaviorAnalyticsOptional', label: '행동 분석 데이터 수집 동의', required: false },
              ].map(({ key, label, required }) => (
                <label key={key} className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                  consents[key as keyof typeof consents]
                    ? 'border-brand-500/30 bg-brand-500/5'
                    : 'border-surface-border hover:border-surface-hover'
                } ${required ? 'opacity-70 cursor-not-allowed' : ''}`}>
                  <div>
                    <p className="text-sm text-slate-200">{label}</p>
                    {required && <p className="text-xs text-slate-500">필수 항목 (변경 불가)</p>}
                  </div>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    consents[key as keyof typeof consents] ? 'bg-brand-500 border-brand-500' : 'border-surface-border'
                  }`} onClick={() => !required && setConsents(prev => ({ ...prev, [key]: !prev[key as keyof typeof consents] }))}>
                    {consents[key as keyof typeof consents] && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                </label>
              ))}
              <button onClick={handleUpdateConsents} disabled={isLoading} className="btn-primary">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                저장
              </button>
            </div>
          )}

          {/* 계정 삭제 */}
          {tab === 'danger' && (
            <div className="card border-red-500/20 space-y-4 animate-fade-in">
              <h2 className="font-semibold font-display text-red-400">위험 구역</h2>
              <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                <h3 className="text-sm font-medium text-red-300 mb-2">계정 삭제</h3>
                <p className="text-xs text-slate-400 mb-3">
                  계정 삭제를 요청하면 30일 후 모든 데이터가 영구적으로 삭제됩니다.
                  30일 내에는 취소할 수 있습니다.
                </p>
                <button
                  onClick={handleRequestDeletion}
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  계정 삭제 요청
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
