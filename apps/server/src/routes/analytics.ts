import type { FastifyInstance } from "fastify";
import { getFunnelByKey } from "../db/repo.js";
import { getAnalytics } from "../lib/analytics.js";

interface AnalyticsQuery {
  funnelId?: string;
  version?: string;
  variant?: "A" | "B";
  utmCampaign?: string;
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: AnalyticsQuery }>("/", async (req, reply) => {
    const { funnelId, version, variant, utmCampaign } = req.query;
    if (!funnelId) return reply.code(400).send({ error: "funnelId is required" });

    const funnel = getFunnelByKey(app.db, funnelId);
    if (!funnel) return reply.code(404).send({ error: "funnel not found" });

    return getAnalytics(app.db, funnel, {
      version: version ? Number(version) : undefined,
      variant: variant && (variant === "A" || variant === "B") ? variant : undefined,
      utmCampaign: utmCampaign || undefined,
    });
  });
}
