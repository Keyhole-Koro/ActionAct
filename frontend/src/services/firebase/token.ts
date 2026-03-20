"use client";

import { onIdTokenChanged, type User } from "firebase/auth";

import { auth } from "@/services/firebase/app";

// Cache the token and its expiry so that rapid successive calls (e.g. multiple
// hooks mounting at once) don't each trigger a separate getIdToken() round-trip.
// Firebase tokens are valid for 1 hour; we refresh 5 minutes before expiry.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

let _cachedToken: string | null = null;
let _cacheExpiresAt = 0;

// Invalidate the cache whenever the auth token rotates (sign-in, sign-out,
// force-refresh). subscribeToIdTokenChanges already calls this automatically.
function invalidateCache() {
  _cachedToken = null;
  _cacheExpiresAt = 0;
}

export async function getFirebaseIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    invalidateCache();
    return null;
  }

  if (_cachedToken !== null && Date.now() < _cacheExpiresAt) {
    return _cachedToken;
  }

  const token = await user.getIdToken();
  _cachedToken = token;
  // Decode expiry from the JWT payload (second segment, base64url).
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (typeof payload.exp === 'number') {
      _cacheExpiresAt = payload.exp * 1000 - TOKEN_REFRESH_MARGIN_MS;
    } else {
      _cacheExpiresAt = Date.now() + 55 * 60 * 1000; // fallback: 55 min
    }
  } catch {
    _cacheExpiresAt = Date.now() + 55 * 60 * 1000;
  }
  return token;
}

export function subscribeToIdTokenChanges(callback: (user: User | null) => void): () => void {
  return onIdTokenChanged(auth, (user) => {
    invalidateCache();
    callback(user);
  });
}
