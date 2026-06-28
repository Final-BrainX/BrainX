'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Joyride, STATUS, EVENTS, ACTIONS, type Step, type EventData } from 'react-joyride';
import { useGuideStore } from '@/lib/use-guide-store';
import { useBrainX } from '@/components/brainx-provider';
import { usePathname } from 'next/navigation';
import { readAuthSession } from '@/lib/auth-api';

// 온보딩 가이드를 띄우지 않는 라우트. notion-callback은 Notion OAuth 팝업(작은 창)에서
// 잠깐 떴다가 닫히는 페이지라 튜토리얼 오버레이가 뜨면 안 된다.
const TUTORIAL_DISABLED_ROUTES = ['/notion-callback'];

// 전체 투어 스텝 정의 (9개 항목: 환영 + 8개 기능)
const WELCOME_STEPS: Step[] = [
  {
    target: 'body',
    content: (
      <div>
        <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>🧠 BrainX에 오신 것을 환영합니다!</div>
        <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'inherit' }}>
          당신의 지식을 연결하고 탐험하는 여정을 시작해 볼까요?<br/>
          주요 기능들을 간단히 안내해 드리겠습니다.
        </div>
      </div>
    ),
    placement: 'center',
    skipBeacon: true,
  },
  {
    target: '.tutorial-target-home',
    content: (
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>🏠 홈</div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'inherit' }}>
          생성한 노트와 최근 활동을 한눈에 확인할 수 있는 메인 공간입니다.
        </div>
      </div>
    ),
    placement: 'right',
    skipBeacon: true,
  },
  {
    target: '.tutorial-target-notes',
    content: (
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>📝 노트</div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'inherit' }}>
          아이디어와 지식을 자유롭게 기록하세요. AI가 자동으로 정리해 드립니다.
        </div>
      </div>
    ),
    placement: 'right',
    skipBeacon: true,
  },
  {
    target: '.tutorial-target-mindmap',
    content: (
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>🗺️ 마인드맵</div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'inherit' }}>
          작성한 노트들이 어떻게 연결되는지 마인드맵으로 시각화할 수 있습니다.
        </div>
      </div>
    ),
    placement: 'right',
    skipBeacon: true,
  },
  {
    target: '.tutorial-target-ai',
    content: (
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>🤖 AI 챗</div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'inherit' }}>
          AI에게 질문해 보세요. 작성하신 노트 컨텍스트를 기반으로 스마트한 답변을 드립니다.
        </div>
      </div>
    ),
    placement: 'right',
    skipBeacon: true,
  },
  {
    target: '.tutorial-target-search',
    content: (
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>🔍 검색</div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'inherit' }}>
          원하는 지식을 쉽게 찾아볼 수 있습니다. 의미 검색 모드로 더 스마트하게 탐색하세요.
        </div>
      </div>
    ),
    placement: 'bottom',
    skipBeacon: true,
  },
  {
    target: '.tutorial-target-profile',
    content: (
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>👤 나의 프로필</div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'inherit' }}>
          프로필 설정, 구독 관리, 튜토리얼 다시보기 등 다양한 설정을 관리할 수 있습니다.
        </div>
      </div>
    ),
    placement: 'bottom',
    skipBeacon: true,
  },
  {
    target: '.tutorial-target-notifications',
    content: (
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>🔔 알림</div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'inherit' }}>
          중요한 업데이트와 알림을 실시간으로 확인할 수 있습니다.
        </div>
      </div>
    ),
    placement: 'bottom',
    skipBeacon: true,
  },
  {
    target: '.tutorial-target-darkmode',
    content: (
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>🌙 다크모드</div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'inherit' }}>
          눈에 편한 다크모드와 라이트모드를 자유롭게 전환할 수 있습니다.
        </div>
      </div>
    ),
    placement: 'bottom',
    skipBeacon: true,
  },
];

/** 닫기 확인 다이얼로그 */
function ExitConfirmDialog({
  onConfirm,
  onCancel,
  isLight,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isLight: boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isLight ? 'rgba(15,23,42,0.28)' : 'rgba(0,0,0,0.6)',
      }}
    >
      <div
        style={{
          background: isLight ? '#ffffff' : 'rgb(30, 41, 59)',
          border: `1px solid ${isLight ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '16px',
          padding: '32px 36px',
          maxWidth: '360px',
          width: '90%',
          textAlign: 'center',
          boxShadow: isLight ? '0 20px 60px rgba(15,23,42,0.2)' : '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🚪</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: isLight ? '#0f172a' : '#f1f5f9', marginBottom: '8px' }}>
          튜토리얼을 종료하시겠습니까?
        </div>
        <div style={{ fontSize: '13px', color: isLight ? '#64748b' : '#94a3b8', marginBottom: '24px', lineHeight: 1.6 }}>
          나중에 프로필 메뉴에서 튜토리얼을 다시 볼 수 있습니다.
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              height: '38px',
              borderRadius: '8px',
              border: `1px solid ${isLight ? 'rgba(15,23,42,0.14)' : 'rgba(255,255,255,0.15)'}`,
              background: 'transparent',
              color: isLight ? '#334155' : '#cbd5e1',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            계속 보기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1,
              height: '38px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            종료하기
          </button>
        </div>
      </div>
    </div>
  );
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // 클로즈 버튼 눌렸을 때 현재 스텝 인덱스 보존
  const pausedStepRef = useRef(0);

  const pathname = usePathname();
  const tutorialDisabled = TUTORIAL_DISABLED_ROUTES.some((route) => pathname.startsWith(route));
  const { effectiveTheme } = useBrainX();
  const { hasSeenWelcomeTour, isManualTrigger, markWelcomeTourSeen, clearManualTrigger, isNewUserFirstLogin, clearNewUserFirstLogin } = useGuideStore();
  const isLight = effectiveTheme === 'dark';
  const tutorialTheme = {
    tooltipBg: isLight ? '#ffffff' : 'rgb(30, 41, 59)',
    tooltipText: isLight ? '#334155' : '#cbd5e1',
    tooltipTitle: isLight ? '#0f172a' : '#f1f5f9',
    tooltipMuted: isLight ? '#64748b' : '#94a3b8',
    tooltipBorder: isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255,255,255,0.1)',
    tooltipShadow: isLight ? '0 16px 40px rgba(15,23,42,0.18)' : '0 16px 40px rgba(0,0,0,0.4)',
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 자동 실행: 회원가입 후 온보딩 완료 시 isNewUserFirstLogin=true이면 1회만 실행
  useEffect(() => {
    if (!isMounted || tutorialDisabled) return;

    if (isManualTrigger) {
      // 수동 다시보기 트리거
      setStepIndex(0);
      setShowExitConfirm(false);
      setRun(true);
      clearManualTrigger();
      return;
    }

    // 비로그인 상태이면 튜토리얼 실행 안 함
    const session = readAuthSession();
    const isLoggedIn = Boolean(session?.accessToken);
    if (!isLoggedIn) return;

    const isHomePage = pathname === '/home' || pathname === '/';
    if (isHomePage && isNewUserFirstLogin && !hasSeenWelcomeTour && !run) {
      // 회원가입 후 첫 로그인으로 홈 진입 시 자동 실행
      clearNewUserFirstLogin();
      setStepIndex(0);
      setRun(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, isManualTrigger, isNewUserFirstLogin, pathname, hasSeenWelcomeTour]);

  const handleTutorialComplete = () => {
    setRun(false);
    setStepIndex(0);
    markWelcomeTourSeen();
    clearManualTrigger();
    clearNewUserFirstLogin();
  };

  const handleJoyrideEvent = (data: EventData) => {
    const { status, type, action, index } = data;

    // 다음 스텝 이동
    if (type === EVENTS.STEP_AFTER && action === ACTIONS.NEXT) {
      setStepIndex(index + 1);
      return;
    }

    // 이전 스텝 이동
    if (type === EVENTS.STEP_AFTER && action === ACTIONS.PREV) {
      setStepIndex(Math.max(0, index - 1));
      return;
    }

    // 닫기(X) 버튼 클릭 → 확인 다이얼로그 표시
    if (
      (type === EVENTS.STEP_AFTER && action === ACTIONS.CLOSE) ||
      (type === EVENTS.TOUR_END && action === ACTIONS.CLOSE)
    ) {
      pausedStepRef.current = index;
      setRun(false);
      setShowExitConfirm(true);
      return;
    }

    // 완료
    if (status === STATUS.FINISHED) {
      handleTutorialComplete();
      return;
    }

    // ESC 키 → 확인 다이얼로그
    if (status === STATUS.SKIPPED) {
      pausedStepRef.current = index;
      setRun(false);
      setShowExitConfirm(true);
    }
  };

  const handleExitConfirm = () => {
    setShowExitConfirm(false);
    handleTutorialComplete();
  };

  const handleExitCancel = () => {
    setShowExitConfirm(false);
    setStepIndex(pausedStepRef.current);
    setRun(true);
  };

  if (!isMounted || tutorialDisabled) return <>{children}</>;

  return (
    <>
      {showExitConfirm && (
        <ExitConfirmDialog onConfirm={handleExitConfirm} onCancel={handleExitCancel} isLight={isLight} />
      )}
      <Joyride
        steps={WELCOME_STEPS}
        run={run}
        stepIndex={stepIndex}
        continuous
        options={{
          zIndex: 10000,
          overlayColor: isLight ? 'rgba(15, 23, 42, 0.32)' : 'rgba(0, 0, 0, 0.55)',
          primaryColor: '#6366f1',
          textColor: tutorialTheme.tooltipTitle,
          backgroundColor: tutorialTheme.tooltipBg,
          arrowColor: tutorialTheme.tooltipBg,
          arrowBase: 10,
          arrowSize: 6,
          arrowSpacing: 6,
          showProgress: true,
          skipBeacon: true,
          buttons: ['back', 'close', 'primary'],
          overlayClickAction: false,
          dismissKeyAction: 'close',
        }}
        locale={{
          back: '이전',
          close: '닫기',
          last: '완료',
          next: '다음',
          nextWithProgress: '다음 ({current}/{total})',
          open: '열기',
          skip: '건너뛰기',
        }}
        styles={{
          tooltip: {
            borderRadius: '14px',
            boxShadow: tutorialTheme.tooltipShadow,
            border: `1px solid ${tutorialTheme.tooltipBorder}`,
            backgroundColor: tutorialTheme.tooltipBg,
            color: tutorialTheme.tooltipTitle,
            maxWidth: '360px',
          },
          tooltipContainer: {
            padding: '20px 22px 18px',
            textAlign: 'left',
          },
          tooltipContent: {
            fontSize: '13px',
            color: tutorialTheme.tooltipText,
            lineHeight: 1.7,
            padding: 0,
            wordBreak: 'keep-all',
            overflowWrap: 'break-word',
            whiteSpace: 'normal',
          },
          tooltipFooter: {
            alignItems: 'center',
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
            marginTop: '16px',
            padding: 0,
          },
          buttonPrimary: {
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            padding: '8px 18px',
            fontWeight: 700,
            fontSize: '13px',
            border: 'none',
            color: '#fff',
          },
          buttonBack: {
            color: tutorialTheme.tooltipMuted,
            fontSize: '13px',
          },
          buttonClose: {
            color: tutorialTheme.tooltipMuted,
            width: '12px',
            height: '12px',
            padding: '5px',
            right: '10px',
            top: '10px',
          },
          buttonSkip: {
            color: tutorialTheme.tooltipMuted,
            fontSize: '12px',
          },
        }}
        onEvent={handleJoyrideEvent}
      />
      {children}
    </>
  );
}
