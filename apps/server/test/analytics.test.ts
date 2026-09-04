import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestApp, createSession } from "./helpers.js";

async function sendEvents(app: FastifyInstance, events: Record<string, unknown>[]) {
  return app.inject({ method: "POST", url: "/api/events", payload: { events } });
}

describe("analytics aggregation", () => {
  it("counts unique sessions, not raw events, and is unaffected by duplicates or out-of-order delivery", async () => {
    const app = makeTestApp();

    const completed = await createSession(app, { variant: "A" });
    const dropped = await createSession(app, { variant: "A" });

    await sendEvents(app, [
      { event_id: "c1", session_id: completed.sessionId, type: "session_started", client_ts: 1000, step_id: "s1" },
      { event_id: "c2", session_id: completed.sessionId, type: "step_viewed", client_ts: 1001, step_id: "s1" },
      { event_id: "c3", session_id: completed.sessionId, type: "step_completed", client_ts: 1002, step_id: "s1" },
      { event_id: "c4", session_id: completed.sessionId, type: "step_viewed", client_ts: 1003, step_id: "s2a" },
      { event_id: "c5", session_id: completed.sessionId, type: "step_completed", client_ts: 1004, step_id: "s2a" },
      { event_id: "c6", session_id: completed.sessionId, type: "step_viewed", client_ts: 1005, step_id: "s3" },
      { event_id: "c7", session_id: completed.sessionId, type: "step_completed", client_ts: 1006, step_id: "s3" },
      { event_id: "c8", session_id: completed.sessionId, type: "step_viewed", client_ts: 1007, step_id: "s4" },
      { event_id: "c9", session_id: completed.sessionId, type: "step_completed", client_ts: 1008, step_id: "s4" },
      // out-of-order: an earlier client_ts arriving in a later request than events "in the future"
      { event_id: "c10", session_id: completed.sessionId, type: "result_viewed", client_ts: 100, step_id: "s5" },
      { event_id: "c11", session_id: completed.sessionId, type: "cta_clicked", client_ts: 101, step_id: "s5" },
      // duplicate resend of an earlier event
      { event_id: "c1", session_id: completed.sessionId, type: "session_started", client_ts: 1000, step_id: "s1" },
    ]);

    await sendEvents(app, [
      { event_id: "d1", session_id: dropped.sessionId, type: "session_started", client_ts: 2000, step_id: "s1" },
      { event_id: "d2", session_id: dropped.sessionId, type: "step_viewed", client_ts: 2001, step_id: "s1" },
    ]);

    const res = await app.inject({ method: "GET", url: "/api/analytics?funnelId=test-funnel" });
    const body = res.json();

    expect(body.sessionsStarted).toBe(2);
    expect(body.resultReached).toBe(1);
    expect(body.ctaClicks).toBe(1);
    expect(body.ctaCTR).toBe(1);

    const byStep = Object.fromEntries(body.steps.map((s: any) => [s.stepId, s]));
    expect(byStep.s1.viewedSessions).toBe(2);
    expect(byStep.s2a.viewedSessions).toBe(1);
    expect(byStep.s1.dropOff).toBe(1); // the "dropped" session viewed s1 but never reached s2a

    const variantA = body.byVariant.find((v: any) => v.variant === "A");
    expect(variantA.sessionsStarted).toBe(2);
    expect(variantA.resultReached).toBe(1);
  });

  it("filters by utm campaign", async () => {
    const app = makeTestApp();
    const withCampaign = await app
      .inject({
        method: "POST",
        url: "/api/sessions",
        payload: { funnelId: "test-funnel", utm: { utm_campaign: "spring_sale" } },
      })
      .then((r) => r.json());
    const withoutCampaign = await createSession(app);

    await sendEvents(app, [
      { event_id: "x1", session_id: withCampaign.sessionId, type: "session_started", client_ts: 1 },
      { event_id: "x2", session_id: withoutCampaign.sessionId, type: "session_started", client_ts: 1 },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/analytics?funnelId=test-funnel&utmCampaign=spring_sale",
    });
    expect(res.json().sessionsStarted).toBe(1);
  });
});
