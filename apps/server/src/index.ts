import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb } from "./db/client.js";
import { seedFunnelFromFile } from "./seed.js";
import { buildApp } from "./app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

const DB_PATH = process.env.DB_PATH ?? join(REPO_ROOT, "apps/server/data/funnel.sqlite");
const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

const db = createDb(DB_PATH);
seedFunnelFromFile(db, join(REPO_ROOT, "configs/fitness-onboarding.v1.json"));

const app = buildApp(db);

app
  .listen({ port: PORT, host: HOST })
  .then(() => console.log(`funnel-runtime server listening on http://localhost:${PORT}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
