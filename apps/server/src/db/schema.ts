export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS funnels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS funnel_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funnel_id INTEGER NOT NULL REFERENCES funnels(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  UNIQUE (funnel_id, version)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  funnel_id INTEGER NOT NULL REFERENCES funnels(id),
  funnel_version_id INTEGER NOT NULL REFERENCES funnel_versions(id),
  version INTEGER NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  answers_json TEXT NOT NULL DEFAULT '{}',
  current_step_id TEXT NOT NULL,
  visited_steps_json TEXT NOT NULL DEFAULT '[]',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  funnel_id INTEGER NOT NULL,
  funnel_version_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  variant TEXT NOT NULL,
  type TEXT NOT NULL,
  step_id TEXT,
  utm_campaign TEXT,
  client_ts INTEGER NOT NULL,
  server_ts TEXT NOT NULL DEFAULT (datetime('now')),
  properties_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_version ON events(funnel_version_id);
CREATE INDEX IF NOT EXISTS idx_events_campaign ON events(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_sessions_version ON sessions(funnel_version_id);
`;
