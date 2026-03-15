"use client";

import { useAuthState } from "@/features/auth/hooks/useAuthState";

export function useRequireAuth() {
  const authState = useAuthState();

  return {
    ...authState,
    isAuthenticated: authState.user !== null,
  };
}
