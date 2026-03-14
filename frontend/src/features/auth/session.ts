export type AuthContextPayload = {
  workspaceId: string;
  topicId: string;
};

const FIREBASE_ID_TOKEN_KEY = "firebase_id_token";
const AUTH_CONTEXT_EVENT = "action:auth-context";

export function getFirebaseIdToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(FIREBASE_ID_TOKEN_KEY);
}

export function setFirebaseIdToken(idToken: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(FIREBASE_ID_TOKEN_KEY, idToken);
}

export function emitAuthContext(payload: AuthContextPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<AuthContextPayload>(AUTH_CONTEXT_EVENT, { detail: payload }));
}
