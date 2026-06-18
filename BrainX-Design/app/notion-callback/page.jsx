'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function NotionCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('processing');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      sessionStorage.setItem('notionCallbackError', 'Notion 연동이 거부되었습니다.');
      router.replace('/#/import');
      return;
    }

    if (!code || !state) {
      sessionStorage.setItem('notionCallbackError', '잘못된 콜백 요청입니다.');
      router.replace('/#/import');
      return;
    }

    const token = localStorage.getItem('accessToken');
    fetch('/api/ingestion/v1/imports/notion/oauth/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({ code, state }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data?.integrationAccountId) {
          sessionStorage.setItem('notionIntegrationId', data.data.integrationAccountId);
          setStatus('success');
        } else {
          throw new Error('no id');
        }
      })
      .catch(() => {
        sessionStorage.setItem('notionCallbackError', 'Notion 연동에 실패했습니다.');
        setStatus('error');
      })
      .finally(() => {
        setTimeout(() => router.replace('/#/import'), 1000);
      });
  }, []);

  const icon = status === 'success' ? '✓' : status === 'error' ? '✕' : null;
  const msg =
    status === 'processing'
      ? 'Notion 연동 처리 중...'
      : status === 'success'
      ? 'Notion 연동 완료!'
      : 'Notion 연동에 실패했습니다.';

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0b1020', color: '#f8fafc', fontFamily: 'system-ui',
    }}>
      <div style={{ textAlign: 'center' }}>
        {status === 'processing' ? (
          <div style={{
            width: 40, height: 40, border: '2px solid #3b82f6',
            borderTopColor: 'transparent', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
        ) : (
          <div style={{
            width: 40, height: 40, borderRadius: '50%', margin: '0 auto 16px',
            background: status === 'success' ? 'rgba(52,211,153,0.15)' : 'rgba(244,114,182,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: status === 'success' ? '#34d399' : '#f472b6',
          }}>{icon}</div>
        )}
        <p style={{ fontSize: 14, color: '#94a3b8' }}>{msg}</p>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>잠시 후 앱으로 이동합니다...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
