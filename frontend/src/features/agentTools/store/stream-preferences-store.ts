"use client";

import { create } from "zustand";

export type ModelProfile = "flash" | "deep_research";

interface StreamPreferencesState {
  showThoughts: boolean;
  includeThoughts: boolean;
  useWebGrounding: boolean;
  modelProfile: ModelProfile;
  setPreferences: (
    patch: Partial<Pick<StreamPreferencesState, "showThoughts" | "includeThoughts" | "useWebGrounding" | "modelProfile">>,
  ) => void;
}

export const useStreamPreferencesStore = create<StreamPreferencesState>((set) => ({
  showThoughts: false,
  includeThoughts: false,
  useWebGrounding: false,
  modelProfile: "flash",
  setPreferences: (patch) => set((state) => ({ ...state, ...patch })),
}));
