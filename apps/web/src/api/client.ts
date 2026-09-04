import type { Step, Answers, TrackedEvent } from "@funnel/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export interface SessionView {
  sessionId: string;
  funnelKey: string;
  version: number;
  variant: "A" | "B";
  entryStepId: string;
  steps: Step[];
  currentStepId: string;
  currentStep: Step | undefined;
  answers: Answers;
  progress: { visited: number; likelyTotal: number };
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
  funnelKey: string;
  variant?: "A" | "B";
  utm?: Record<string, string>;
}): Promise<SessionView> {
  const qs = params.variant ? `?variant=${params.variant}` : "";
  return request(`/api/sessions${qs}`, {
    method: "POST",
    body: JSON.stringify({ funnelKey: params.funnelKey, utm: params.utm }),
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

export function listVersions(funnelKey: string): Promise<VersionSummary[]> {
  return request(`/api/admin/funnels/${funnelKey}/versions`);
}

export function getActiveVersion(funnelKey: string): Promise<VersionSummary> {
  return request(`/api/admin/funnels/${funnelKey}/active`);
}

export function publishVersion(funnelKey: string, config: unknown): Promise<VersionSummary> {
  return request(`/api/admin/funnels/${funnelKey}/versions`, {
    method: "POST",
    body: JSON.stringify({ config }),
  });
}

export function activateVersion(funnelKey: string, version: number): Promise<VersionSummary> {
  return request(`/api/admin/funnels/${funnelKey}/versions/${version}/activate`, { method: "POST" });
}

export interface AnalyticsResponse {
  funnelKey: string;
  sessionsStarted: number;
  resultReached: number;
  ctaClicks: number;
  ctaCTR: number | null;
  steps: { stepId: string; viewedSessions: number; completedSessions: number; dropOff: number }[];
  byVariant: { variant: "A" | "B"; sessionsStarted: number; resultReached: number; ctaClicks: number; ctaCTR: number | null }[];
  byVersion: { version: number; sessionsStarted: number; resultReached: number; ctaClicks: number; ctaCTR: number | null }[];
}

export function getAnalytics(params: {
  funnelKey: string;
  version?: number;
  variant?: "A" | "B";
  utmCampaign?: string;
}): Promise<AnalyticsResponse> {
  const query = new URLSearchParams({ funnelKey: params.funnelKey });
  if (params.version !== undefined) query.set("version", String(params.version));
  if (params.variant) query.set("variant", params.variant);
  if (params.utmCampaign) query.set("utmCampaign", params.utmCampaign);
  return request(`/api/analytics?${query.toString()}`);
}
