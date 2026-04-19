import { create } from 'zustand';

export const useAppStore = create((set) => ({
  isCrisisMode: false,
  setCrisisMode: (status) => set({ isCrisisMode: status }),
}));
