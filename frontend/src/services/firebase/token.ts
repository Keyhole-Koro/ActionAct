"use client";

import { onIdTokenChanged, type User } from "firebase/auth";

import { auth } from "@/services/firebase/app";

export async function getFirebaseIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken();
}

export function subscribeToIdTokenChanges(callback: (user: User | null) => void): () => void {
  return onIdTokenChanged(auth, callback);
}

