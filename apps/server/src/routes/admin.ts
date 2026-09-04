import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { FunnelConfig } from "@funnel/shared";
import {
  activateVersion,
  getActiveVersion,
  getFunnelByKey,
  getOrCreateFunnel,
  listVersions,
  publishVersion,
} from "../db/repo.js";

const stepOverrideSchema = z.object({ content: z.record(z.unknown()).optional() }).partial();

const variantSchema = z.object({
  weight: z.number().positive(),
  stepSequence: z.array(z.string().min(1)).min(1),
  stepOverrides: z.record(stepOverrideSchema).optional(),
  resultOverrides: z.record(z.unknown()).optional(),
});

const publishSchema = z.object({
  config: z.object({
    funnelId: z.string().min(1),
    title: z.string().min(1),
    experiment: z.object({
      id: z.string().min(1),
      assignment: z.string(),
      overrideQueryParam: z.string().optional(),
      variants: z.object({ A: variantSchema, B: variantSchema }),
    }),
    steps: z.record(z.record(z.unknown())).refine((s) => Object.keys(s).length >= 6, {
      message: "a funnel needs at least 6 steps",
    }),
    resultRules: z.array(z.record(z.unknown())),
    defaultResultId: z.string().min(1),
    results: z.record(z.record(z.unknown())),
  }),
});

function serializeVersion(row: {
  version: number;
  status: string;
  created_at: string;
  published_at: string | null;
  config_json: string;
}) {
  return {
    version: row.version,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    config: JSON.parse(row.config_json),
  };
}

export async function adminRoutes(app: FastifyInstance) {
  app.get<{ Params: { funnelId: string } }>("/funnels/:funnelId/versions", async (req, reply) => {
    const funnel = getFunnelByKey(app.db, req.params.funnelId);
    if (!funnel) return reply.code(404).send({ error: "funnel not found" });
    return listVersions(app.db, funnel.id).map(serializeVersion);
  });

  app.get<{ Params: { funnelId: string } }>("/funnels/:funnelId/active", async (req, reply) => {
    const funnel = getFunnelByKey(app.db, req.params.funnelId);
    if (!funnel) return reply.code(404).send({ error: "funnel not found" });
    const active = getActiveVersion(app.db, funnel.id);
    if (!active) return reply.code(404).send({ error: "no active version" });
    return serializeVersion(active);
  });

  app.post<{ Params: { funnelId: string } }>("/funnels/:funnelId/versions", async (req, reply) => {
    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const config = parsed.data.config as unknown as FunnelConfig;
    const stepIds = new Set(Object.keys(config.steps));
    for (const variant of ["A", "B"] as const) {
      for (const stepId of config.experiment.variants[variant].stepSequence) {
        if (!stepIds.has(stepId)) {
          return reply.code(400).send({ error: `stepSequence references unknown step "${stepId}" (variant ${variant})` });
        }
      }
    }
    if (!(config.defaultResultId in config.results)) {
      return reply.code(400).send({ error: "defaultResultId does not match any entry in results" });
    }

    const funnel = getOrCreateFunnel(app.db, req.params.funnelId, config.title);
    const version = publishVersion(app.db, funnel.id, config);
    return reply.code(201).send(serializeVersion(version));
  });

  app.post<{ Params: { funnelId: string; version: string } }>(
    "/funnels/:funnelId/versions/:version/activate",
    async (req, reply) => {
      const funnel = getFunnelByKey(app.db, req.params.funnelId);
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
