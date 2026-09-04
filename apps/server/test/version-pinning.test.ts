import { describe, expect, it } from "vitest";
import { makeTestApp, createSession } from "./helpers.js";
import { testFunnelConfig } from "./fixtures.js";

describe("session version pinning", () => {
  it("keeps an existing session on the version it started with after a new version is published", async () => {
    const app = makeTestApp();

    const session = await createSession(app);
    expect(session.version).toBe(1);

    const publishRes = await app.inject({
      method: "POST",
      url: `/api/admin/funnels/${testFunnelConfig.funnelId}/versions`,
      payload: { config: { ...testFunnelConfig, title: "Test Funnel v2" } },
    });
    expect(publishRes.statusCode).toBe(201);
    expect(publishRes.json().version).toBe(2);

    const resumed = await app.inject({ method: "GET", url: `/api/sessions/${session.sessionId}` });
    expect(resumed.json().version).toBe(1);

    const newSession = await createSession(app);
    expect(newSession.version).toBe(2);
  });
});
