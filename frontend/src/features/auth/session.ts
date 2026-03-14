export type AuthContextPayload = {
  workspaceId: string;
  topicId: string;
};

const AUTH_CONTEXT_EVENT = "action:auth-context";

export function emitAuthContext(payload: AuthContextPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<AuthContextPayload>(AUTH_CONTEXT_EVENT, { detail: payload }));
}
