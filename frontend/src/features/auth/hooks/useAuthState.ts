"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth } from "@/services/firebase/app";

type AuthState = {
  user: User | null;
  loading: boolean;
  error: Error | null;
};

export function useAuthState(): AuthState {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    return onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setLoading(false);
        setError(null);
      },
      (nextError) => {
        setError(nextError);
        setLoading(false);
      },
    );
  }, []);

  return { user, loading, error };
}

