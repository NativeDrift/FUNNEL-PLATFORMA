import { describe, expect, it } from "vitest";
import { makeTestApp, createSession } from "./helpers.js";

describe("event ingestion", () => {
  it("deduplicates repeated event_id within one batch", async () => {
    const app = makeTestApp();
    const session = await createSession(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      payload: {
        events: [
          { event_id: "e1", session_id: session.sessionId, type: "session_started", client_ts: 1000 },
          { event_id: "e1", session_id: session.sessionId, type: "session_started", client_ts: 1000 },
        ],
      },
    });

    expect(res.json()).toEqual({ accepted: ["e1"], duplicates: ["e1"], failed: [] });
  });

  it("is safe to retry the same batch after a timeout", async () => {
    const app = makeTestApp();
    const session = await createSession(app);
    const payload = {
      events: [
        { event_id: "e1", session_id: session.sessionId, type: "step_viewed", client_ts: 1000, step_id: "s1" },
      ],
    };

    const first = await app.inject({ method: "POST", url: "/api/events", payload });
    expect(first.json().accepted).toEqual(["e1"]);

    const retry = await app.inject({ method: "POST", url: "/api/events", payload });
    expect(retry.json()).toEqual({ accepted: [], duplicates: ["e1"], failed: [] });
  });

  it("does not let one malformed event break the rest of the batch", async () => {
    const app = makeTestApp();
    const session = await createSession(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      payload: {
        events: [
          { event_id: "good-1", session_id: session.sessionId, type: "step_viewed", client_ts: 1000 },
          { event_id: "bad-1", session_id: "no-such-session", type: "step_viewed", client_ts: 1000 },
          { event_id: "good-2", session_id: session.sessionId, type: "step_completed", client_ts: 1001 },
        ],
      },
    });

    const body = res.json();
    expect(body.accepted.sort()).toEqual(["good-1", "good-2"]);
    expect(body.failed).toEqual([{ event_id: "bad-1", error: "unknown session_id" }]);
  });
});
