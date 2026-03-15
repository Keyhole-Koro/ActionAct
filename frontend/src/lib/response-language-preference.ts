export type ResponseLanguage = "ja" | "en";

const STORAGE_KEY = "preferences.responseLanguage";
const CHANGE_EVENT = "action:response-language";

function isResponseLanguage(value: string | null): value is ResponseLanguage {
  return value === "ja" || value === "en";
}

function detectBrowserDefaultLanguage(): ResponseLanguage {
  if (typeof navigator === "undefined") {
    return "ja";
  }
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function getResponseLanguagePreference(): ResponseLanguage {
  if (typeof window === "undefined") {
    return "ja";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isResponseLanguage(stored)) {
    return stored;
  }

  const detected = detectBrowserDefaultLanguage();
  window.localStorage.setItem(STORAGE_KEY, detected);
  return detected;
}

export function setResponseLanguagePreference(language: ResponseLanguage): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, language);
  window.dispatchEvent(
    new CustomEvent<{ language: ResponseLanguage }>(CHANGE_EVENT, {
      detail: { language },
    }),
  );
}

export function subscribeResponseLanguagePreference(
  listener: (language: ResponseLanguage) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ language?: string }>;
    const language = customEvent.detail?.language;
    if (!isResponseLanguage(language ?? null)) {
      return;
    }
    listener(language);
  };

  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

export function applyResponseLanguagePreference(query: string): string {
  const language = getResponseLanguagePreference();
  const languageInstruction =
    language === "ja"
      ? "回答は日本語で行ってください。"
      : "Please answer in English.";

  return `${query}\n\n[Response language preference]\n${languageInstruction}`;
}
