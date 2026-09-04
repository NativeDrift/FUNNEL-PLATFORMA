import { describe, expect, it } from "vitest";
import { makeTestApp, createSession } from "./helpers.js";

describe("A/B variant stability", () => {
  it("respects a query-param override at session creation", async () => {
    const app = makeTestApp();
    const sessionA = await createSession(app, { variant: "A" });
    const sessionB = await createSession(app, { variant: "B" });
    expect(sessionA.variant).toBe("A");
    expect(sessionB.variant).toBe("B");
  });

  it("keeps the assigned variant stable across refresh/resume", async () => {
    const app = makeTestApp();
    const session = await createSession(app, { variant: "B" });

    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "GET", url: `/api/sessions/${session.sessionId}` });
      expect(res.json().variant).toBe("B");
    }
  });

  it("only ever assigns A or B when no override is given", async () => {
    const app = makeTestApp();
    for (let i = 0; i < 20; i++) {
      const session = await createSession(app);
      expect(["A", "B"]).toContain(session.variant);
    }
  });
});
