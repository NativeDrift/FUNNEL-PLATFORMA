function storageKey(funnelKey: string): string {
  return `funnel_session_${funnelKey}`;
}

export function getStoredSessionId(funnelKey: string): string | null {
  try {
    return localStorage.getItem(storageKey(funnelKey));
  } catch {
    return null;
  }
}

export function setStoredSessionId(funnelKey: string, sessionId: string): void {
  try {
    localStorage.setItem(storageKey(funnelKey), sessionId);
  } catch {
    // ignore
  }
}

export function clearStoredSessionId(funnelKey: string): void {
  try {
    localStorage.removeItem(storageKey(funnelKey));
  } catch {
    // ignore
  }
}

export interface QueryContext {
  variant?: "A" | "B";
  utm: Record<string, string>;
}

export function readQueryContext(): QueryContext {
  const params = new URLSearchParams(window.location.search);
  const variantParam = params.get("variant");
  const utm: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const value = params.get(key);
    if (value) utm[key] = value;
  }
  return {
    variant: variantParam === "A" || variantParam === "B" ? variantParam : undefined,
    utm,
  };
}
