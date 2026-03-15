"use client";

import { create } from "zustand";

export type ModelProfile = "flash" | "deep_research";

interface StreamPreferencesState {
  showThoughts: boolean;
  includeThoughts: boolean;
  useWebGroundingOverride: boolean | null;
  modelProfile: ModelProfile;
  setPreferences: (
    patch: Partial<Pick<StreamPreferencesState, "showThoughts" | "includeThoughts" | "useWebGroundingOverride" | "modelProfile">>,
  ) => void;
}

export const useStreamPreferencesStore = create<StreamPreferencesState>((set) => ({
  showThoughts: false,
  includeThoughts: false,
  useWebGroundingOverride: null,
  modelProfile: "flash",
  setPreferences: (patch) => set((state) => ({ ...state, ...patch })),
}));
