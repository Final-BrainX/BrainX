import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface UserGuideState {
  userId: string;
  completedTutorials: string[];
  discoveredFeatures: string[];
  skillLevel: SkillLevel;
  totalEvents: number;
  firstSeenAt: string;
  /** 최초 환영 투어를 이미 봤는지 여부 (자동 실행 여부 제어) */
  hasSeenWelcomeTour: boolean;
  /** 수동 다시보기 트리거 */
  isManualTrigger: boolean;

  completeTutorial: (tutorialId: string) => void;
  discoverFeature: (featureId: string) => void;
  incrementEventCount: () => void;
  updateSkillLevel: (level: SkillLevel) => void;
  setUserId: (id: string) => void;
  /** 튜토리얼 다시보기 (수동 트리거) */
  triggerTutorialReplay: () => void;
  /** 최초 환영 투어 완료 처리 */
  markWelcomeTourSeen: () => void;
  clearManualTrigger: () => void;
  /** 레거시 호환 */
  resetTutorials: () => void;
}

export const useGuideStore = create<UserGuideState>()(
  persist(
    (set) => ({
      userId: 'anonymous',
      completedTutorials: [],
      discoveredFeatures: [],
      skillLevel: 'BEGINNER',
      totalEvents: 0,
      firstSeenAt: new Date().toISOString(),
      hasSeenWelcomeTour: false,
      isManualTrigger: false,

      completeTutorial: (tutorialId) =>
        set((state) => ({
          completedTutorials: state.completedTutorials.includes(tutorialId)
            ? state.completedTutorials
            : [...state.completedTutorials, tutorialId],
        })),

      discoverFeature: (featureId) =>
        set((state) => ({
          discoveredFeatures: state.discoveredFeatures.includes(featureId)
            ? state.discoveredFeatures
            : [...state.discoveredFeatures, featureId],
        })),

      incrementEventCount: () =>
        set((state) => ({ totalEvents: state.totalEvents + 1 })),

      updateSkillLevel: (skillLevel) => set({ skillLevel }),
      
      setUserId: (userId) => set({ userId }),

      triggerTutorialReplay: () => set({ isManualTrigger: true }),

      markWelcomeTourSeen: () =>
        set((state) => ({
          hasSeenWelcomeTour: true,
          completedTutorials: state.completedTutorials.includes('welcome_tour')
            ? state.completedTutorials
            : [...state.completedTutorials, 'welcome_tour'],
        })),

      clearManualTrigger: () => set({ isManualTrigger: false }),

      /** 레거시 호환: 사이드바 버튼 등에서 호출될 수 있음 */
      resetTutorials: () => set({ isManualTrigger: true }),
    }),
    {
      name: 'brainx-guide-storage',
    }
  )
);
