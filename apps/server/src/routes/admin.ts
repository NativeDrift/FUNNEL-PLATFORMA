import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { FunnelConfig } from "@funnel/shared";
import {
  activateVersion,
  getActiveVersion,
  getFunnelByKey,
  listVersions,
  publishVersion,
} from "../db/repo.js";

const publishSchema = z.object({
  config: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    entryStepId: z.string().min(1),
    steps: z.array(z.record(z.unknown())).min(6, "a funnel needs at least 6 steps"),
    variants: z.record(z.unknown()).optional(),
  }),
});

function serializeVersion(row: { version: number; status: string; created_at: string; published_at: string | null; config_json: string }) {
  return {
    version: row.version,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    config: JSON.parse(row.config_json),
  };
}

export async function adminRoutes(app: FastifyInstance) {
  app.get<{ Params: { key: string } }>("/funnels/:key/versions", async (req, reply) => {
    const funnel = getFunnelByKey(app.db, req.params.key);
    if (!funnel) return reply.code(404).send({ error: "funnel not found" });
    return listVersions(app.db, funnel.id).map(serializeVersion);
  });

  app.get<{ Params: { key: string } }>("/funnels/:key/active", async (req, reply) => {
    const funnel = getFunnelByKey(app.db, req.params.key);
    if (!funnel) return reply.code(404).send({ error: "funnel not found" });
    const active = getActiveVersion(app.db, funnel.id);
    if (!active) return reply.code(404).send({ error: "no active version" });
    return serializeVersion(active);
  });

  app.post<{ Params: { key: string } }>("/funnels/:key/versions", async (req, reply) => {
    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const config = parsed.data.config as unknown as FunnelConfig;
    const stepIds = new Set(config.steps.map((s) => s.id));
    if (!stepIds.has(config.entryStepId)) {
      return reply.code(400).send({ error: "entryStepId does not match any step" });
    }

    const funnel = getFunnelByKey(app.db, req.params.key) ?? { id: null };
    const funnelId =
      funnel.id ??
      (() => {
        app.db.prepare("INSERT INTO funnels (key, name) VALUES (?, ?)").run(req.params.key, config.name);
        return (app.db.prepare("SELECT id FROM funnels WHERE key = ?").get(req.params.key) as { id: number }).id;
      })();

    const version = publishVersion(app.db, funnelId, config);
    return reply.code(201).send(serializeVersion(version));
  });

  app.post<{ Params: { key: string; version: string } }>(
    "/funnels/:key/versions/:version/activate",
    async (req, reply) => {
      const funnel = getFunnelByKey(app.db, req.params.key);
      if (!funnel) return reply.code(404).send({ error: "funnel not found" });

      const versionNumber = Number(req.params.version);
      if (!Number.isInteger(versionNumber)) return reply.code(400).send({ error: "invalid version" });

      try {
        const activated = activateVersion(app.db, funnel.id, versionNumber);
        return serializeVersion(activated);
      } catch (err) {
        return reply.code(404).send({ error: (err as Error).message });
      }
    }
  );
}
