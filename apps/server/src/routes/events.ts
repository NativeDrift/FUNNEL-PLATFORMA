import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { insertEventsBatch } from "../db/repo.js";

const eventSchema = z.object({
  event_id: z.string().min(1),
  session_id: z.string().min(1),
  type: z.string().min(1),
  client_ts: z.number(),
  step_id: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(500),
});

export async function eventsRoutes(app: FastifyInstance) {
  app.post("/", async (req, reply) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = insertEventsBatch(app.db, parsed.data.events);
    return reply.code(200).send(result);
  });
}
