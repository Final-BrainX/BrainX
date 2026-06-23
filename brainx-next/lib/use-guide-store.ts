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
  
  completeTutorial: (tutorialId: string) => void;
  discoverFeature: (featureId: string) => void;
  incrementEventCount: () => void;
  updateSkillLevel: (level: SkillLevel) => void;
  setUserId: (id: string) => void;
  resetTutorials: () => void;
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

      resetTutorials: () => set({ completedTutorials: [], isManualTrigger: true }),
      
      clearManualTrigger: () => set({ isManualTrigger: false }),
    }),
    {
      name: 'brainx-guide-storage',
    }
  )
);
