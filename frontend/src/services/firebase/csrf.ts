import { getCookie } from "@/lib/cookie";

const CSRF_STORAGE_KEY = "actionact.csrfToken";

let csrfToken = "";

export function getCSRFToken(): string {
  if (csrfToken) {
    return csrfToken;
  }

  if (typeof window !== "undefined") {
    const stored = window.sessionStorage.getItem(CSRF_STORAGE_KEY) ?? "";
    if (stored) {
      csrfToken = stored;
      return csrfToken;
    }
  }

  csrfToken = getCookie("csrf_token");
  return csrfToken;
}

export function setCSRFToken(value: string): void {
  csrfToken = value;
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(CSRF_STORAGE_KEY, value);
  }
}
