import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { notionApi } from '../api/ingestion'

export default function NotionCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('Notion 연동 처리 중...')
  const calledRef = useRef(false)

  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      setStatus('error')
      setMessage('Notion 연동이 거부되었습니다.')
      setTimeout(() => navigate('/import-export'), 2000)
      return
    }

    if (!code || !state) {
      setStatus('error')
      setMessage('잘못된 콜백 요청입니다.')
      setTimeout(() => navigate('/import-export'), 2000)
      return
    }

    notionApi.callback(code, state)
      .then((res) => {
        const integrationAccountId = res.data.data.integrationAccountId
        setStatus('success')
        setMessage('Notion 연동이 완료되었습니다!')
        // integrationAccountId를 sessionStorage에 저장해서 import 페이지에서 사용
        sessionStorage.setItem('notionIntegrationId', integrationAccountId)
        setTimeout(() => navigate('/import-export'), 1500)
      })
      .catch(() => {
        setStatus('error')
        setMessage('Notion 연동에 실패했습니다.')
        setTimeout(() => navigate('/import-export'), 2000)
      })
  }, [])

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="text-center space-y-4">
        {status === 'processing' && (
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        )}
        {status === 'success' && (
          <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
            <span className="text-emerald-400 text-xl">✓</span>
          </div>
        )}
        {status === 'error' && (
          <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
            <span className="text-red-400 text-xl">✕</span>
          </div>
        )}
        <p className={`text-sm font-medium ${
          status === 'success' ? 'text-emerald-300'
          : status === 'error' ? 'text-red-300'
          : 'text-slate-300'
        }`}>
          {message}
        </p>
        <p className="text-xs text-slate-500">잠시 후 가져오기 페이지로 이동합니다...</p>
      </div>
    </div>
  )
}
