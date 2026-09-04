import { describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers.js";
import { testFunnelConfig } from "./fixtures.js";

describe("publish and rollback", () => {
  it("publishing archives the previous active version and activates the new one", async () => {
    const app = makeTestApp();

    const publishRes = await app.inject({
      method: "POST",
      url: `/api/admin/funnels/${testFunnelConfig.key}/versions`,
      payload: { config: { ...testFunnelConfig, name: "v2" } },
    });
    expect(publishRes.statusCode).toBe(201);
    expect(publishRes.json()).toMatchObject({ version: 2, status: "active" });

    const list = await app.inject({ method: "GET", url: `/api/admin/funnels/${testFunnelConfig.key}/versions` });
    const versions = list.json();
    expect(versions).toHaveLength(2);
    expect(versions.find((v: any) => v.version === 1).status).toBe("archived");
    expect(versions.find((v: any) => v.version === 2).status).toBe("active");
  });

  it("rolling back reactivates an older version without deleting history", async () => {
    const app = makeTestApp();
    await app.inject({
      method: "POST",
      url: `/api/admin/funnels/${testFunnelConfig.key}/versions`,
      payload: { config: { ...testFunnelConfig, name: "v2" } },
    });

    const rollback = await app.inject({
      method: "POST",
      url: `/api/admin/funnels/${testFunnelConfig.key}/versions/1/activate`,
    });
    expect(rollback.statusCode).toBe(200);
    expect(rollback.json()).toMatchObject({ version: 1, status: "active" });

    const active = await app.inject({ method: "GET", url: `/api/admin/funnels/${testFunnelConfig.key}/active` });
    expect(active.json().version).toBe(1);

    const list = await app.inject({ method: "GET", url: `/api/admin/funnels/${testFunnelConfig.key}/versions` });
    expect(list.json()).toHaveLength(2);
  });

  it("rejects rollback to a version that does not exist", async () => {
    const app = makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/funnels/${testFunnelConfig.key}/versions/99/activate`,
    });
    expect(res.statusCode).toBe(404);
  });
});
