/**
 * Synthetic traffic generator for the funnel runtime.
 *
 * Drives the funnel purely through the public HTTP API (the same one the
 * real frontend uses), so it exercises session creation, branching,
 * A/B assignment and the event ingestion endpoint end-to-end against
 * whichever funnel version is currently active.
 *
 * Usage: npm run seed:traffic   (server must already be running)
 */
import type { Step } from "@funnel/shared";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const FUNNEL_KEY = process.env.FUNNEL_KEY ?? "fitness-onboarding";
const SESSION_COUNT = Number(process.env.SESSION_COUNT ?? 130);
const CONCURRENCY = 8;

interface TrackedEvent {
  event_id: string;
  session_id: string;
  type: string;
  client_ts: number;
  step_id?: string;
  properties?: Record<string, unknown>;
}

interface SessionView {
  sessionId: string;
  version: number;
  variant: "A" | "B";
  currentStepId: string;
  currentStep: Step;
}

const UTM_SOURCES = ["google", "facebook", "instagram", "newsletter", "direct"];
const UTM_MEDIUMS = ["cpc", "social", "email", "organic"];
const UTM_CAMPAIGNS = ["spring_sale", "summer_launch", "retargeting", "brand"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function makeEvent(sessionId: string, type: string, stepId?: string, properties?: Record<string, unknown>): TrackedEvent {
  return { event_id: crypto.randomUUID(), session_id: sessionId, type, client_ts: Date.now(), step_id: stepId, properties };
}

function answerFor(step: Step): string | string[] | number {
  switch (step.type) {
    case "single-select":
      return pick(step.options).value;
    case "multi-select": {
      const count = randomInt(1, Math.min(step.options.length, step.maxSelected ?? step.options.length));
      const shuffled = [...step.options].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count).map((o) => o.value);
    }
    case "number":
      return randomInt(step.min ?? 0, step.max ?? 100);
    case "info":
      return "seen";
    default:
      return "seen";
  }
}

interface RunResult {
  events: TrackedEvent[];
  reachedResult: boolean;
}

async function runSession(index: number): Promise<void> {
  const forcedVariant = index < 20 ? (index % 2 === 0 ? "A" : "B") : undefined;
  const utm = {
    utm_source: pick(UTM_SOURCES),
    utm_medium: pick(UTM_MEDIUMS),
    utm_campaign: pick(UTM_CAMPAIGNS),
  };
  const qs = forcedVariant ? `?variant=${forcedVariant}` : "";

  let session = await api<SessionView>(`/api/sessions${qs}`, {
    method: "POST",
    body: JSON.stringify({ funnelKey: FUNNEL_KEY, utm }),
  });

  const events: TrackedEvent[] = [makeEvent(session.sessionId, "session_started", session.currentStepId)];

  const dropAtStep = Math.random() < 0.3 ? randomInt(1, 4) : Infinity;
  let stepsTaken = 0;
  let reachedResult = false;

  while (stepsTaken < 20) {
    events.push(makeEvent(session.sessionId, "step_viewed", session.currentStepId));

    if (session.currentStep.type === "result") {
      events.push(makeEvent(session.sessionId, "result_viewed", session.currentStepId));
      reachedResult = true;
      if (Math.random() < 0.65) {
        events.push(makeEvent(session.sessionId, "cta_clicked", session.currentStepId));
      }
      break;
    }

    stepsTaken += 1;
    if (stepsTaken >= dropAtStep) break; // simulated drop-off: user just leaves

    // occasionally go back a step first, then forward again
    if (Math.random() < 0.1 && stepsTaken > 1) {
      events.push(makeEvent(session.sessionId, "back_clicked", session.currentStepId));
      session = await api<SessionView>(`/api/sessions/${session.sessionId}/back`, { method: "POST" });
      events.push(makeEvent(session.sessionId, "step_viewed", session.currentStepId));
    }

    const value = answerFor(session.currentStep);
    events.push(makeEvent(session.sessionId, "answer_submitted", session.currentStepId, { value }));

    session = await api<SessionView>(`/api/sessions/${session.sessionId}/answers`, {
      method: "POST",
      body: JSON.stringify({ stepId: session.currentStepId, value }),
    });
    events.push(makeEvent(session.sessionId, "step_completed", events[events.length - 1].step_id));
  }

  await deliverEvents(index, events);
}

/**
 * Sends the session's events to the ingestion endpoint, occasionally in a
 * way that exercises the invariants the spec calls out: a duplicate event_id
 * inside a batch, a retried (resent) batch, and events split across two
 * requests so the second one arrives "out of order" relative to client_ts.
 */
async function deliverEvents(index: number, events: TrackedEvent[]): Promise<void> {
  if (index % 11 === 0 && events.length > 2) {
    // split into two batches, sent with the later-timestamped half first
    const mid = Math.floor(events.length / 2);
    const [first, second] = [events.slice(0, mid), events.slice(mid)];
    await api(`/api/events`, { method: "POST", body: JSON.stringify({ events: second }) });
    await api(`/api/events`, { method: "POST", body: JSON.stringify({ events: first }) });
  } else if (index % 13 === 0) {
    // duplicate event_id within the same batch
    const withDupe = [...events, events[0]];
    await api(`/api/events`, { method: "POST", body: JSON.stringify({ events: withDupe }) });
  } else {
    await api(`/api/events`, { method: "POST", body: JSON.stringify({ events }) });
  }

  if (index % 17 === 0) {
    // resend the whole batch again, simulating a client retry after a timeout
    await api(`/api/events`, { method: "POST", body: JSON.stringify({ events }) });
  }
}

async function runWithConcurrency(count: number, concurrency: number, task: (i: number) => Promise<void>) {
  let next = 0;
  let failures = 0;
  async function worker() {
    while (next < count) {
      const i = next++;
      try {
        await task(i);
      } catch (err) {
        failures += 1;
        console.error(`session ${i} failed:`, (err as Error).message);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return failures;
}

async function main() {
  console.log(`Generating ${SESSION_COUNT} synthetic sessions against ${API_URL} (funnel: ${FUNNEL_KEY})...`);
  const failures = await runWithConcurrency(SESSION_COUNT, CONCURRENCY, runSession);
  console.log(`Done. ${SESSION_COUNT - failures}/${SESSION_COUNT} sessions completed successfully.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
