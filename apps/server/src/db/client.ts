import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { SCHEMA_SQL } from "./schema.js";

// Loaded via createRequire (rather than a static `import`) because node:sqlite
// is new enough that some bundlers/test runners don't yet recognize it as a
// builtin and try to resolve it as an npm package named "sqlite".
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: typeof DatabaseSyncType;
};

export function createDb(path: string): DatabaseSyncType {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  return db;
}
