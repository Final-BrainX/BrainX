'use client';

import { useEffect, useState } from 'react';
import { Joyride, STATUS, type Step } from 'react-joyride';
import { useGuideStore } from '@/lib/use-guide-store';
import { usePathname } from 'next/navigation';

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  
  const pathname = usePathname();
  const { completedTutorials, completeTutorial, skillLevel, discoveredFeatures, isManualTrigger, clearManualTrigger } = useGuideStore();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const isMainPage = pathname === '/home' || pathname === '/';

    // 1. 기본 환영 튜토리얼 (BEGINNER)
    if (isManualTrigger || (isMainPage && skillLevel === 'BEGINNER' && !completedTutorials.includes('welcome_tour'))) {
      setSteps([
        {
          target: 'body',
          content: 'BrainX에 오신 것을 환영합니다! 당신의 지식을 연결하고 탐험하는 여정을 시작해 볼까요?',
          placement: 'center',
        },
        {
          target: '.tutorial-target-home',
          content: '홈 메뉴입니다. 생성한 노트와 최근 활동을 한눈에 확인할 수 있습니다.',
          placement: 'right',
        },
        {
          target: '.tutorial-target-mindmap',
          content: '작성한 노트들이 어떻게 연결되는지 마인드맵으로 시각화할 수 있습니다.',
          placement: 'right',
        },
        {
          target: '.tutorial-target-search',
          content: '원하는 지식을 쉽게 찾아볼 수 있는 검색 기능입니다.',
          placement: 'right',
        }
      ]);
      setRun(true);
    }
    
    // 2. 검색 미사용자 탐색 유도 (INTERMEDIATE 이상이면서 검색을 쓰지 않은 경우)
    else if (!discoveredFeatures.includes('search') && !completedTutorials.includes('search_discovery_tour')) {
      setSteps([
        {
          target: '.tutorial-target-search',
          content: '검색 기능을 활용해 보시겠어요? 입력한 키워드와 관련된 노트를 즉시 찾아줍니다.',
          placement: 'right',
        }
      ]);
      setRun(true);
    }

    // 3. AI 미사용자 탐색 유도
    else if (!discoveredFeatures.includes('ai_question') && !completedTutorials.includes('ai_discovery_tour')) {
      setSteps([
        {
          target: '.tutorial-target-ai',
          content: 'AI에게 질문해 보세요. 작성하신 노트 컨텍스트를 기반으로 답변해 줍니다.',
          placement: 'right',
        }
      ]);
      setRun(true);
    }

  }, [isMounted, completedTutorials, skillLevel, discoveredFeatures, pathname, isManualTrigger]);

  const handleJoyrideCallback = (data: any) => {
    const { status, type } = data;
    
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    
    if (finishedStatuses.includes(status)) {
      setRun(false);
      clearManualTrigger();
      // 어떤 투어를 완료했는지 추론하여 기록
      if (skillLevel === 'BEGINNER' && !completedTutorials.includes('welcome_tour')) {
        completeTutorial('welcome_tour');
      } else if (!discoveredFeatures.includes('search') && !completedTutorials.includes('search_discovery_tour')) {
        completeTutorial('search_discovery_tour');
      } else if (!discoveredFeatures.includes('ai_question') && !completedTutorials.includes('ai_discovery_tour')) {
        completeTutorial('ai_discovery_tour');
      }
    }
  };

  if (!isMounted) return <>{children}</>;

  return (
    <>
      <Joyride
        steps={steps}
        run={run}
        continuous
        showProgress
        showSkipButton
        styles={{
          // @ts-ignore - options property exists in runtime for react-joyride but may be typed differently
          options: {
            zIndex: 10000,
            primaryColor: 'rgb(var(--accent))',
            textColor: '#fff',
            backgroundColor: 'rgb(30, 41, 59)',
            arrowColor: 'rgb(30, 41, 59)',
            overlayColor: 'rgba(0, 0, 0, 0.5)',
          },
          tooltip: {
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          },
          buttonNext: {
            borderRadius: '8px',
            backgroundColor: 'rgb(var(--accent))',
            padding: '8px 16px',
            fontWeight: 600,
          },
          buttonBack: {
            color: '#cbd5e1',
          },
          buttonSkip: {
            color: '#94a3b8',
          }
        }}
        callback={handleJoyrideCallback}
      />
      {children}
    </>
  );
}
