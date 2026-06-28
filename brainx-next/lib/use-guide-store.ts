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
  hasSeenWelcomeTour: boolean;
  /** 회원가입 후 온보딩 완료 시 true로 설정, 튜토리얼 1회 실행 후 false로 초기화 */
  isNewUserFirstLogin: boolean;

  completeTutorial: (tutorialId: string) => void;
  discoverFeature: (featureId: string) => void;
  incrementEventCount: () => void;
  updateSkillLevel: (level: SkillLevel) => void;
  setUserId: (id: string) => void;
  resetTutorials: () => void;
  markWelcomeTourSeen: () => void;
  markAsNewUserFirstLogin: () => void;
  clearNewUserFirstLogin: () => void;
  triggerTutorialReplay: () => void;
  isManualTrigger: boolean;
  clearManualTrigger: () => void;
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
      isNewUserFirstLogin: false,
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

      resetTutorials: () => set({ completedTutorials: [], hasSeenWelcomeTour: false, isManualTrigger: true }),

      markWelcomeTourSeen: () => set({ hasSeenWelcomeTour: true }),

      markAsNewUserFirstLogin: () => set({ isNewUserFirstLogin: true }),

      clearNewUserFirstLogin: () => set({ isNewUserFirstLogin: false }),

      triggerTutorialReplay: () => set({ isManualTrigger: true }),

      clearManualTrigger: () => set({ isManualTrigger: false }),
    }),
    {
      name: 'brainx-guide-storage',
    }
  )
);
