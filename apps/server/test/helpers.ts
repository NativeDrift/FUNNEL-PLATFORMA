import type { FastifyInstance } from "fastify";
import { createDb } from "../src/db/client.js";
import { buildApp } from "../src/app.js";
import { seedFunnel } from "../src/seed.js";
import { testFunnelConfig } from "./fixtures.js";
import type { FunnelConfig } from "@funnel/shared";

export function makeTestApp(config: FunnelConfig = testFunnelConfig): FastifyInstance {
  const db = createDb(":memory:");
  seedFunnel(db, config);
  return buildApp(db);
}

export async function createSession(app: FastifyInstance, opts: { funnelKey?: string; variant?: "A" | "B" } = {}) {
  const query = opts.variant ? `?variant=${opts.variant}` : "";
  const res = await app.inject({
    method: "POST",
    url: `/api/sessions${query}`,
    payload: { funnelKey: opts.funnelKey ?? testFunnelConfig.key },
  });
  return res.json();
}
