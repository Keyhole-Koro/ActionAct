import { getCookie } from "@/lib/cookie";

export function getCSRFToken(): string {
  return getCookie("csrf_token");
}

