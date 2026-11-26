-- Safe to run again: install.sh applies this file on every install and upgrade.

-- Tickets from the server metric alerts (alert triage workflow).
CREATE TABLE IF NOT EXISTS tickets (
    id            SERIAL PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    alertname     TEXT NOT NULL,
    instance      TEXT,
    severity      TEXT,
    priority      TEXT,
    summary       TEXT,
    likely_cause  TEXT,
    first_steps   TEXT,
    runbook       TEXT,
    metric_now    DOUBLE PRECISION,
    metric_1h_ago DOUBLE PRECISION,
    status        TEXT NOT NULL DEFAULT 'open',
    resolved_at   TIMESTAMPTZ,
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
    occurrences   INT NOT NULL DEFAULT 1,
    fingerprint   TEXT
);

-- App incidents found by the app watch workflow (one row per root cause).
CREATE TABLE IF NOT EXISTS incidents (
    id             SERIAL PRIMARY KEY,
    fingerprint    TEXT NOT NULL,
    app            TEXT NOT NULL,
    root_container TEXT NOT NULL,
    cause_type     TEXT,
    title          TEXT,
    cause          TEXT,
    evidence       JSONB,
    affected       JSONB,
    next_steps     JSONB,
    investigation  JSONB,
    status         TEXT NOT NULL DEFAULT 'open',
    first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
    occurrences    INT NOT NULL DEFAULT 1,
    resolved_at    TIMESTAMPTZ,
    resolved_note  TEXT,
    emailed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS incidents_open ON incidents (fingerprint) WHERE status = 'open';

-- Columns added after the first release.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;
