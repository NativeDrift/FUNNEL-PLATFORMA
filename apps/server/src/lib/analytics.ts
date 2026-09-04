import type { DatabaseSync } from "node:sqlite";
import { computeLikelyPath, resolveFunnelForVariant, type FunnelConfig, type Variant } from "@funnel/shared";
import { getVersionByNumber, getActiveVersion, type FunnelRow } from "../db/repo.js";

export interface AnalyticsFilters {
  version?: number;
  variant?: Variant;
  utmCampaign?: string;
}

interface WhereClause {
  clause: string;
  params: (string | number)[];
}

function buildWhere(funnelId: number, filters: AnalyticsFilters): WhereClause {
  const clauses = ["funnel_id = ?"];
  const params: (string | number)[] = [funnelId];

  if (filters.version !== undefined) {
    clauses.push("version = ?");
    params.push(filters.version);
  }
  if (filters.variant) {
    clauses.push("variant = ?");
    params.push(filters.variant);
  }
  if (filters.utmCampaign) {
    clauses.push("utm_campaign = ?");
    params.push(filters.utmCampaign);
  }

  return { clause: clauses.join(" AND "), params };
}

function countDistinctSessions(
  db: DatabaseSync,
  table: "sessions" | "events",
  where: WhereClause,
  extra?: { type?: string }
): number {
  const clauses = [where.clause];
  const params = [...where.params];
  if (extra?.type) {
    clauses.push("type = ?");
    params.push(extra.type);
  }
  const idCol = table === "sessions" ? "id" : "session_id";
  const row = db
    .prepare(`SELECT COUNT(DISTINCT ${idCol}) as n FROM ${table} WHERE ${clauses.join(" AND ")}`)
    .get(...params) as { n: number };
  return row.n;
}

function countDistinctSessionsForStep(
  db: DatabaseSync,
  where: WhereClause,
  type: string,
  stepId: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT session_id) as n FROM events WHERE ${where.clause} AND type = ? AND step_id = ?`
    )
    .get(...where.params, type, stepId) as { n: number };
  return row.n;
}

export interface StepMetric {
  stepId: string;
  viewedSessions: number;
  completedSessions: number;
  dropOff: number;
}

export interface VariantSummary {
  variant: Variant;
  sessionsStarted: number;
  resultReached: number;
  ctaClicks: number;
  ctaCTR: number | null;
}

export interface VersionSummary {
  version: number;
  sessionsStarted: number;
  resultReached: number;
  ctaClicks: number;
  ctaCTR: number | null;
}

export interface AnalyticsResult {
  funnelKey: string;
  filters: AnalyticsFilters;
  sessionsStarted: number;
  resultReached: number;
  ctaClicks: number;
  ctaCTR: number | null;
  steps: StepMetric[];
  byVariant: VariantSummary[];
  byVersion: VersionSummary[];
}

function resolveCanonicalStepOrder(
  db: DatabaseSync,
  funnelId: number,
  filters: AnalyticsFilters
): string[] {
  const versionRow =
    (filters.version !== undefined ? getVersionByNumber(db, funnelId, filters.version) : undefined) ??
    getActiveVersion(db, funnelId);
  if (!versionRow) return [];

  const config = JSON.parse(versionRow.config_json) as FunnelConfig;
  const variant: Variant = filters.variant ?? "A";
  const resolved = resolveFunnelForVariant(config, variant);
  const path = computeLikelyPath(resolved, {});
  return path.filter((id) => resolved.steps.get(id)?.type !== "result");
}

function summarize(
  db: DatabaseSync,
  funnelId: number,
  filters: AnalyticsFilters
): { sessionsStarted: number; resultReached: number; ctaClicks: number; ctaCTR: number | null } {
  const sessionsWhere = buildWhere(funnelId, filters);
  const eventsWhere = buildWhere(funnelId, filters);

  const sessionsStarted = countDistinctSessions(db, "sessions", sessionsWhere);
  const resultReached = countDistinctSessions(db, "events", eventsWhere, { type: "result_viewed" });
  const ctaClicks = countDistinctSessions(db, "events", eventsWhere, { type: "cta_clicked" });
  const ctaCTR = resultReached > 0 ? ctaClicks / resultReached : null;

  return { sessionsStarted, resultReached, ctaClicks, ctaCTR };
}

export function getAnalytics(db: DatabaseSync, funnel: FunnelRow, filters: AnalyticsFilters): AnalyticsResult {
  const overall = summarize(db, funnel.id, filters);
  const eventsWhere = buildWhere(funnel.id, filters);

  const stepIds = resolveCanonicalStepOrder(db, funnel.id, filters);
  const viewedCounts = stepIds.map((stepId) =>
    countDistinctSessionsForStep(db, eventsWhere, "step_viewed", stepId)
  );
  const steps: StepMetric[] = stepIds.map((stepId, i) => {
    const viewedSessions = viewedCounts[i];
    const completedSessions = countDistinctSessionsForStep(db, eventsWhere, "step_completed", stepId);
    const nextViewed = i + 1 < viewedCounts.length ? viewedCounts[i + 1] : overall.resultReached;
    const dropOff = Math.max(0, viewedSessions - nextViewed);
    return { stepId, viewedSessions, completedSessions, dropOff };
  });

  const byVariant: VariantSummary[] = (["A", "B"] as Variant[]).map((variant) => ({
    variant,
    ...summarize(db, funnel.id, { ...filters, variant }),
  }));

  const versionRows = db
    .prepare("SELECT DISTINCT version FROM funnel_versions WHERE funnel_id = ? ORDER BY version ASC")
    .all(funnel.id) as { version: number }[];
  const byVersion: VersionSummary[] = versionRows.map(({ version }) => ({
    version,
    ...summarize(db, funnel.id, { ...filters, version }),
  }));

  return {
    funnelKey: funnel.key,
    filters,
    ...overall,
    steps,
    byVariant,
    byVersion,
  };
}
