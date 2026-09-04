import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { DatabaseSync } from "node:sqlite";
import { sessionsRoutes } from "./routes/sessions.js";
import { eventsRoutes } from "./routes/events.js";
import { adminRoutes } from "./routes/admin.js";
import { analyticsRoutes } from "./routes/analytics.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DatabaseSync;
  }
}

export function buildApp(db: DatabaseSync): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate("db", db);

  app.register(cors, { origin: true });

  app.register(sessionsRoutes, { prefix: "/api/sessions" });
  app.register(eventsRoutes, { prefix: "/api/events" });
  app.register(adminRoutes, { prefix: "/api/admin" });
  app.register(analyticsRoutes, { prefix: "/api/analytics" });

  app.get("/health", async () => ({ ok: true }));

  return app;
}
