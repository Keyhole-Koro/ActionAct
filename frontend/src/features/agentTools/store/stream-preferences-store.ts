"use client";

import { create } from "zustand";

export type ModelProfile = "flash" | "deep_research";

interface StreamPreferencesState {
  showThoughts: boolean;
  includeThoughts: boolean;
  useWebGroundingOverride: boolean | null;
  modelProfile: ModelProfile;
  autoRouteEdgeHandles: boolean;
  collapseThresholdMinutes: number;
  setPreferences: (
    patch: Partial<Pick<StreamPreferencesState, "showThoughts" | "includeThoughts" | "useWebGroundingOverride" | "modelProfile" | "autoRouteEdgeHandles" | "collapseThresholdMinutes">>,
  ) => void;
}

export const useStreamPreferencesStore = create<StreamPreferencesState>((set) => ({
  showThoughts: false,
  includeThoughts: false,
  useWebGroundingOverride: null,
  modelProfile: "flash",
  autoRouteEdgeHandles: true,
  collapseThresholdMinutes: 5,
  setPreferences: (patch) => set((state) => ({ ...state, ...patch })),
}));
