export function getCookie(name: string): string {
  const all = typeof document !== "undefined" ? document.cookie : "";
  if (!all) {
    return "";
  }

  const key = `${name}=`;
  const pair = all
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(key));

  return pair ? decodeURIComponent(pair.slice(key.length)) : "";
}

