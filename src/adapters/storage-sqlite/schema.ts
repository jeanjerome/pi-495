export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  digest TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  result TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  aggregate_kind TEXT NOT NULL CHECK (aggregate_kind IN ('change','program')),
  aggregate_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  actor_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  previous_hash TEXT,
  hash TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (aggregate_kind, aggregate_id, sequence)
);
CREATE INDEX IF NOT EXISTS events_aggregate ON events (aggregate_kind, aggregate_id, sequence);
CREATE TABLE IF NOT EXISTS aggregates (
  aggregate_kind TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  last_hash TEXT NOT NULL,
  PRIMARY KEY (aggregate_kind, aggregate_id)
);
CREATE TABLE IF NOT EXISTS changes (
  change_id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  increment_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  outcome TEXT NOT NULL,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS programs (
  program_id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  title TEXT NOT NULL,
  revision INTEGER NOT NULL,
  closed INTEGER NOT NULL,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS programs_path ON programs (project_path);
CREATE TABLE IF NOT EXISTS artifacts (
  artifact_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL,
  change_id TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  producer_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (artifact_id, revision)
);
CREATE INDEX IF NOT EXISTS artifacts_change ON artifacts (change_id, kind);
CREATE TABLE IF NOT EXISTS evidence (
  evidence_id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL,
  control_id TEXT NOT NULL,
  subject_digest TEXT NOT NULL,
  verdict TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  document TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_change ON evidence (change_id);
CREATE TABLE IF NOT EXISTS decision_requests (
  decision_id TEXT PRIMARY KEY,
  change_id TEXT NOT NULL,
  interaction TEXT NOT NULL,
  document TEXT NOT NULL,
  requested_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS human_decisions (
  human_decision_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  change_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  document TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS human_decisions_change ON human_decisions (change_id);
CREATE TABLE IF NOT EXISTS operations (
  operation_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  operation_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  inputs_digest TEXT NOT NULL,
  status TEXT NOT NULL,
  effect_state TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pi_bindings (
  session_id TEXT PRIMARY KEY,
  cwd TEXT NOT NULL,
  program_id TEXT NOT NULL,
  change_id TEXT,
  bound_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pi_bindings_cwd ON pi_bindings (cwd);
CREATE TABLE IF NOT EXISTS leases (
  scope TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  operation_id TEXT
);
`;
