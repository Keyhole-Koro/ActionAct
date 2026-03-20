"use client";

import { create } from "zustand";

export type ModelProfile = "flash" | "deep_research";

interface StreamPreferencesState {
  modelProfile: ModelProfile;
  autoRouteEdgeHandles: boolean;
  collapseThresholdMinutes: number;
  setPreferences: (
    patch: Partial<Pick<StreamPreferencesState, "modelProfile" | "autoRouteEdgeHandles" | "collapseThresholdMinutes">>,
  ) => void;
}

export const useStreamPreferencesStore = create<StreamPreferencesState>((set) => ({
  modelProfile: "flash",
  autoRouteEdgeHandles: true,
  collapseThresholdMinutes: 5,
  setPreferences: (patch) => set((state) => ({ ...state, ...patch })),
}));
