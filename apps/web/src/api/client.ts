import type { Answers, ResolvedResult, StepDef, TrackedEvent } from "@funnel/shared";

// Falls back to whatever host the page itself was loaded from (with the API's port) rather than a
// hardcoded "localhost", so this also works when opened from a phone via the dev machine's LAN IP.
const API_URL = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:4000`;

export interface SessionView {
  sessionId: string;
  funnelId: string;
  version: number;
  variant: "A" | "B";
  currentStepId: string;
  currentStep: StepDef | undefined;
  result: ResolvedResult | undefined;
  answers: Answers;
  progress: { visited: number; total: number };
  position: { index: number; count: number };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function startSession(params: {
  funnelId: string;
  variant?: "A" | "B";
  utm?: Record<string, string>;
}): Promise<SessionView> {
  const qs = params.variant ? `?variant=${params.variant}` : "";
  return request(`/api/sessions${qs}`, {
    method: "POST",
    body: JSON.stringify({ funnelId: params.funnelId, utm: params.utm }),
  });
}

export function resumeSession(sessionId: string): Promise<SessionView> {
  return request(`/api/sessions/${sessionId}`);
}

export function submitAnswer(
  sessionId: string,
  stepId: string,
  value: string | string[] | number
): Promise<SessionView> {
  return request(`/api/sessions/${sessionId}/answers`, {
    method: "POST",
    body: JSON.stringify({ stepId, value }),
  });
}

export function goBack(sessionId: string): Promise<SessionView> {
  return request(`/api/sessions/${sessionId}/back`, { method: "POST" });
}

export function sendEvents(events: TrackedEvent[]): Promise<unknown> {
  return request(`/api/events`, { method: "POST", body: JSON.stringify({ events }) });
}

export interface VersionSummary {
  version: number;
  status: "active" | "archived";
  createdAt: string;
  publishedAt: string | null;
  config: unknown;
}

export function listVersions(funnelId: string): Promise<VersionSummary[]> {
  return request(`/api/admin/funnels/${funnelId}/versions`);
}

export function getActiveVersion(funnelId: string): Promise<VersionSummary> {
  return request(`/api/admin/funnels/${funnelId}/active`);
}

export function publishVersion(funnelId: string, config: unknown): Promise<VersionSummary> {
  return request(`/api/admin/funnels/${funnelId}/versions`, {
    method: "POST",
    body: JSON.stringify({ config }),
  });
}

export function activateVersion(funnelId: string, version: number): Promise<VersionSummary> {
  return request(`/api/admin/funnels/${funnelId}/versions/${version}/activate`, { method: "POST" });
}

export interface AnalyticsResponse {
  funnelId: string;
  sessionsStarted: number;
  resultReached: number;
  ctaClicks: number;
  ctaCTR: number | null;
  steps: { stepId: string; viewedSessions: number; completedSessions: number; dropOff: number }[];
  byVariant: { variant: "A" | "B"; sessionsStarted: number; resultReached: number; ctaClicks: number; ctaCTR: number | null }[];
  byVersion: { version: number; sessionsStarted: number; resultReached: number; ctaClicks: number; ctaCTR: number | null }[];
}

export function getAnalytics(params: {
  funnelId: string;
  version?: number;
  variant?: "A" | "B";
  utmCampaign?: string;
}): Promise<AnalyticsResponse> {
  const query = new URLSearchParams({ funnelId: params.funnelId });
  if (params.version !== undefined) query.set("version", String(params.version));
  if (params.variant) query.set("variant", params.variant);
  if (params.utmCampaign) query.set("utmCampaign", params.utmCampaign);
  return request(`/api/analytics?${query.toString()}`);
}
