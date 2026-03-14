"use client";

import { GoogleAuthProvider, signInWithPopup, signOut, type User } from "firebase/auth";

import { auth } from "@/services/firebase/app";

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(auth);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

