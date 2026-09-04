import type { FastifyInstance } from "fastify";
import { getFunnelByKey } from "../db/repo.js";
import { getAnalytics } from "../lib/analytics.js";

interface AnalyticsQuery {
  funnelKey?: string;
  version?: string;
  variant?: "A" | "B";
  utmCampaign?: string;
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: AnalyticsQuery }>("/", async (req, reply) => {
    const { funnelKey, version, variant, utmCampaign } = req.query;
    if (!funnelKey) return reply.code(400).send({ error: "funnelKey is required" });

    const funnel = getFunnelByKey(app.db, funnelKey);
    if (!funnel) return reply.code(404).send({ error: "funnel not found" });

    return getAnalytics(app.db, funnel, {
      version: version ? Number(version) : undefined,
      variant: variant && (variant === "A" || variant === "B") ? variant : undefined,
      utmCampaign: utmCampaign || undefined,
    });
  });
}
