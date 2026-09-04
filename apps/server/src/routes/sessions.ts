import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getEntryStepId, getNextStepId, validateAnswer, type Answers, type FunnelConfig } from "@funnel/shared";
import {
  createSession,
  getActiveVersion,
  getFunnelByKey,
  getFunnelById,
  getSession,
  getVersionById,
  updateSessionProgress,
} from "../db/repo.js";
import { assignVariant } from "../lib/variant.js";
import { buildSessionView } from "../lib/session-view.js";

const utmSchema = z
  .object({
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_term: z.string().optional(),
    utm_content: z.string().optional(),
  })
  .partial();

const createSessionSchema = z.object({
  funnelId: z.string().min(1),
  variant: z.enum(["A", "B"]).optional(),
  utm: utmSchema.optional(),
});

const answerSchema = z.object({
  stepId: z.string().min(1),
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
});

export async function sessionsRoutes(app: FastifyInstance) {
  app.post("/", async (req, reply) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const funnel = getFunnelByKey(app.db, parsed.data.funnelId);
    if (!funnel) return reply.code(404).send({ error: "funnel not found" });

    const activeVersion = getActiveVersion(app.db, funnel.id);
    if (!activeVersion) return reply.code(404).send({ error: "funnel has no active version" });

    const config = JSON.parse(activeVersion.config_json) as FunnelConfig;
    const query = req.query as { variant?: string };
    const overrideParamName = config.experiment.overrideQueryParam ?? "variant";
    const override = (req.query as Record<string, string | undefined>)[overrideParamName] ?? query.variant ?? parsed.data.variant;
    const variant = assignVariant(config.experiment.variants, override);
    const entryStepId = getEntryStepId(config, variant);

    const session = createSession(app.db, {
      id: randomUUID(),
      funnelId: funnel.id,
      funnelVersionId: activeVersion.id,
      version: activeVersion.version,
      variant,
      entryStepId,
      utm: parsed.data.utm ?? {},
    });

    return reply.code(201).send(buildSessionView(session, funnel.key, config));
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const session = getSession(app.db, req.params.id);
    if (!session) return reply.code(404).send({ error: "session not found" });

    const versionRow = getVersionById(app.db, session.funnel_version_id)!;
    const funnel = getFunnelById(app.db, session.funnel_id)!;
    const config = JSON.parse(versionRow.config_json) as FunnelConfig;

    return buildSessionView(session, funnel.key, config);
  });

  app.post<{ Params: { id: string } }>("/:id/answers", async (req, reply) => {
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const session = getSession(app.db, req.params.id);
    if (!session) return reply.code(404).send({ error: "session not found" });

    const versionRow = getVersionById(app.db, session.funnel_version_id)!;
    const funnel = getFunnelById(app.db, session.funnel_id)!;
    const config = JSON.parse(versionRow.config_json) as FunnelConfig;

    const { stepId, value } = parsed.data;
    if (stepId !== session.current_step_id) {
      return reply.code(409).send({ error: "stepId does not match the session's current step" });
    }

    const step = config.steps[stepId];
    if (!step) return reply.code(400).send({ error: "unknown step" });
    if (step.type === "result") return reply.code(400).send({ error: "result step has no answer" });

    const validation = validateAnswer(step, value);
    if (!validation.valid) return reply.code(400).send({ error: validation.error });

    const answers: Answers = { ...(JSON.parse(session.answers_json) as Answers) };
    if (value !== undefined) answers[stepId] = value;

    const nextStepId = getNextStepId(config, session.variant, stepId, answers);
    if (!nextStepId) return reply.code(500).send({ error: "funnel config has no next step defined" });

    const visitedSteps = JSON.parse(session.visited_steps_json) as string[];
    if (visitedSteps[visitedSteps.length - 1] !== nextStepId) visitedSteps.push(nextStepId);

    updateSessionProgress(app.db, session.id, { answers, currentStepId: nextStepId, visitedSteps });

    const updated = getSession(app.db, session.id)!;
    return buildSessionView(updated, funnel.key, config);
  });

  app.post<{ Params: { id: string } }>("/:id/back", async (req, reply) => {
    const session = getSession(app.db, req.params.id);
    if (!session) return reply.code(404).send({ error: "session not found" });

    const visitedSteps = JSON.parse(session.visited_steps_json) as string[];
    if (visitedSteps.length <= 1) return reply.code(400).send({ error: "already at the first step" });

    visitedSteps.pop();
    const currentStepId = visitedSteps[visitedSteps.length - 1];
    const answers = JSON.parse(session.answers_json) as Answers;
    updateSessionProgress(app.db, session.id, { answers, currentStepId, visitedSteps });

    const versionRow = getVersionById(app.db, session.funnel_version_id)!;
    const funnel = getFunnelById(app.db, session.funnel_id)!;
    const config = JSON.parse(versionRow.config_json) as FunnelConfig;
    const updated = getSession(app.db, session.id)!;
    return buildSessionView(updated, funnel.key, config);
  });
}
