const INTERNAL_ORIGIN = "https://internal.invalid";

export function safeInternalPath(value: string | null | undefined, fallback = "/app") {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith("/")) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return fallback;
  }

  if (
    candidate.startsWith("//")
    || candidate.startsWith("/\\")
    || decoded.startsWith("//")
    || decoded.startsWith("/\\")
    || /[\u0000-\u001f\u007f]/.test(decoded)
  ) return fallback;

  try {
    const url = new URL(candidate, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
