import type { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { FunnelConfig } from "@funnel/shared";
import { getOrCreateFunnel, getActiveVersion, publishVersion, type FunnelVersionRow } from "./db/repo.js";

export function seedFunnel(db: DatabaseSync, config: FunnelConfig): FunnelVersionRow {
  const funnel = getOrCreateFunnel(db, config.key, config.name);
  const active = getActiveVersion(db, funnel.id);
  return active ?? publishVersion(db, funnel.id, config);
}

export function seedFunnelFromFile(db: DatabaseSync, configPath: string): FunnelVersionRow {
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as FunnelConfig;
  return seedFunnel(db, config);
}
