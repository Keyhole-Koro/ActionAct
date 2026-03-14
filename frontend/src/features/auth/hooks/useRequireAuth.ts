"use client";

import { config } from "@/lib/config";
import { useAuthState } from "@/features/auth/hooks/useAuthState";

export function useRequireAuth() {
  const authState = useAuthState();

  return {
    ...authState,
    isAuthenticated: config.useMocks || authState.user !== null,
  };
}

