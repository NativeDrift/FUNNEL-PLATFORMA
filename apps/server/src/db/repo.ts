import type { DatabaseSync } from "node:sqlite";
import type { Answers, FunnelConfig, TrackedEvent, Variant } from "@funnel/shared";

export interface FunnelRow {
  id: number;
  key: string;
  name: string;
  created_at: string;
}

export interface FunnelVersionRow {
  id: number;
  funnel_id: number;
  version: number;
  status: "active" | "archived";
  config_json: string;
  created_at: string;
  published_at: string | null;
}

export interface SessionRow {
  id: string;
  funnel_id: number;
  funnel_version_id: number;
  version: number;
  variant: Variant;
  answers_json: string;
  current_step_id: string;
  visited_steps_json: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  created_at: string;
}

export interface Utm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

function run(db: DatabaseSync, sql: string) {
  db.exec(sql);
}

export function getFunnelByKey(db: DatabaseSync, key: string): FunnelRow | undefined {
  return db.prepare("SELECT * FROM funnels WHERE key = ?").get(key) as unknown as FunnelRow | undefined;
}

export function createFunnel(db: DatabaseSync, key: string, name: string): FunnelRow {
  db.prepare("INSERT INTO funnels (key, name) VALUES (?, ?)").run(key, name);
  return getFunnelByKey(db, key)!;
}

export function getOrCreateFunnel(db: DatabaseSync, key: string, name: string): FunnelRow {
  return getFunnelByKey(db, key) ?? createFunnel(db, key, name);
}

export function getFunnelById(db: DatabaseSync, id: number): FunnelRow | undefined {
  return db.prepare("SELECT * FROM funnels WHERE id = ?").get(id) as unknown as FunnelRow | undefined;
}

export function listVersions(db: DatabaseSync, funnelId: number): FunnelVersionRow[] {
  return db
    .prepare("SELECT * FROM funnel_versions WHERE funnel_id = ? ORDER BY version DESC")
    .all(funnelId) as unknown as FunnelVersionRow[];
}

export function getActiveVersion(db: DatabaseSync, funnelId: number): FunnelVersionRow | undefined {
  return db
    .prepare("SELECT * FROM funnel_versions WHERE funnel_id = ? AND status = 'active'")
    .get(funnelId) as unknown as FunnelVersionRow | undefined;
}

export function getVersionByNumber(
  db: DatabaseSync,
  funnelId: number,
  version: number
): FunnelVersionRow | undefined {
  return db
    .prepare("SELECT * FROM funnel_versions WHERE funnel_id = ? AND version = ?")
    .get(funnelId, version) as unknown as FunnelVersionRow | undefined;
}

export function getVersionById(db: DatabaseSync, id: number): FunnelVersionRow | undefined {
  return db.prepare("SELECT * FROM funnel_versions WHERE id = ?").get(id) as unknown as
    | FunnelVersionRow
    | undefined;
}

export function publishVersion(
  db: DatabaseSync,
  funnelId: number,
  config: FunnelConfig
): FunnelVersionRow {
  const maxRow = db
    .prepare("SELECT COALESCE(MAX(version), 0) as maxVersion FROM funnel_versions WHERE funnel_id = ?")
    .get(funnelId) as unknown as { maxVersion: number };
  const nextVersion = maxRow.maxVersion + 1;

  run(db, "BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE funnel_versions SET status = 'archived' WHERE funnel_id = ? AND status = 'active'").run(
      funnelId
    );
    db.prepare(
      `INSERT INTO funnel_versions (funnel_id, version, status, config_json, published_at)
       VALUES (?, ?, 'active', ?, datetime('now'))`
    ).run(funnelId, nextVersion, JSON.stringify(config));
    run(db, "COMMIT");
  } catch (err) {
    run(db, "ROLLBACK");
    throw err;
  }

  return getVersionByNumber(db, funnelId, nextVersion)!;
}

export function activateVersion(db: DatabaseSync, funnelId: number, version: number): FunnelVersionRow {
  const target = getVersionByNumber(db, funnelId, version);
  if (!target) throw new Error(`version ${version} not found for funnel ${funnelId}`);

  run(db, "BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE funnel_versions SET status = 'archived' WHERE funnel_id = ? AND status = 'active'").run(
      funnelId
    );
    db.prepare("UPDATE funnel_versions SET status = 'active', published_at = datetime('now') WHERE id = ?").run(
      target.id
    );
    run(db, "COMMIT");
  } catch (err) {
    run(db, "ROLLBACK");
    throw err;
  }

  return getVersionById(db, target.id)!;
}

export function createSession(
  db: DatabaseSync,
  params: {
    id: string;
    funnelId: number;
    funnelVersionId: number;
    version: number;
    variant: Variant;
    entryStepId: string;
    utm: Utm;
  }
): SessionRow {
  db.prepare(
    `INSERT INTO sessions
      (id, funnel_id, funnel_version_id, version, variant, answers_json,
       current_step_id, visited_steps_json,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content)
     VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.funnelId,
    params.funnelVersionId,
    params.version,
    params.variant,
    params.entryStepId,
    JSON.stringify([params.entryStepId]),
    params.utm.utm_source ?? null,
    params.utm.utm_medium ?? null,
    params.utm.utm_campaign ?? null,
    params.utm.utm_term ?? null,
    params.utm.utm_content ?? null
  );
  return getSession(db, params.id)!;
}

export function getSession(db: DatabaseSync, id: string): SessionRow | undefined {
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as unknown as SessionRow | undefined;
}

export function updateSessionProgress(
  db: DatabaseSync,
  id: string,
  params: { answers: Answers; currentStepId: string; visitedSteps: string[] }
): void {
  db.prepare(
    "UPDATE sessions SET answers_json = ?, current_step_id = ?, visited_steps_json = ? WHERE id = ?"
  ).run(JSON.stringify(params.answers), params.currentStepId, JSON.stringify(params.visitedSteps), id);
}

export interface EventInsertResult {
  accepted: string[];
  duplicates: string[];
  failed: { event_id: string; error: string }[];
}

export function insertEventsBatch(db: DatabaseSync, events: TrackedEvent[]): EventInsertResult {
  const result: EventInsertResult = { accepted: [], duplicates: [], failed: [] };
  const insert = db.prepare(
    `INSERT OR IGNORE INTO events
      (event_id, session_id, funnel_id, funnel_version_id, version, variant, type, step_id,
       utm_campaign, client_ts, properties_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const evt of events) {
    try {
      const session = getSession(db, evt.session_id);
      if (!session) {
        result.failed.push({ event_id: evt.event_id, error: "unknown session_id" });
        continue;
      }
      const r = insert.run(
        evt.event_id,
        evt.session_id,
        session.funnel_id,
        session.funnel_version_id,
        session.version,
        session.variant,
        evt.type,
        evt.step_id ?? null,
        session.utm_campaign,
        evt.client_ts,
        evt.properties ? JSON.stringify(evt.properties) : null
      );
      if (r.changes > 0) {
        result.accepted.push(evt.event_id);
      } else {
        result.duplicates.push(evt.event_id);
      }
    } catch (err) {
      result.failed.push({ event_id: evt.event_id, error: (err as Error).message });
    }
  }

  return result;
}
