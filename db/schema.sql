-- ABMIL Pose Workforce — PostgreSQL V2 schema.
-- Apply in a dedicated PostgreSQL database: npm run db:migrate.
-- Times are stored as timestamptz (UTC internally); work_date is Europe/Paris.
BEGIN;
CREATE TABLE IF NOT EXISTS admin_account (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id=1),
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  job_title TEXT NOT NULL DEFAULT 'Poseur',
  code VARCHAR(12) NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pin_hash TEXT,
  pin_salt TEXT,
  session_version INTEGER NOT NULL DEFAULT 1,
  invite_hash TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  client TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  planned_break_minutes INTEGER NOT NULL DEFAULT 30 CHECK(planned_break_minutes BETWEEN 0 AND 240),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES employees(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  work_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(end_time > start_time)
);
CREATE INDEX IF NOT EXISTS assignment_worker_date_idx ON assignments(worker_id, work_date);
CREATE INDEX IF NOT EXISTS assignment_date_site_idx ON assignments(work_date, site_id);
CREATE TABLE IF NOT EXISTS work_sessions (
  id UUID PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES employees(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  assignment_id UUID NOT NULL REFERENCES assignments(id),
  work_date DATE NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  site_label_at_start TEXT NOT NULL DEFAULT '',
  client_at_start TEXT NOT NULL DEFAULT '',
  corrected_break_minutes INTEGER CHECK(corrected_break_minutes BETWEEN 0 AND 1440),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  correction_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at IS NULL OR end_at > start_at)
);
-- Two server instances cannot open two sessions for one worker.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift_per_worker ON work_sessions(worker_id) WHERE end_at IS NULL AND voided = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS one_session_per_assignment ON work_sessions(assignment_id) WHERE voided = FALSE;
CREATE INDEX IF NOT EXISTS work_session_worker_date_idx ON work_sessions(worker_id, work_date);
CREATE INDEX IF NOT EXISTS work_session_site_date_idx ON work_sessions(site_id, work_date);
CREATE TABLE IF NOT EXISTS work_breaks (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES work_sessions(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  CHECK (end_at IS NULL OR end_at >= start_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_break_per_session ON work_breaks(session_id) WHERE end_at IS NULL;
CREATE INDEX IF NOT EXISTS break_session_idx ON work_breaks(session_id);
CREATE TABLE IF NOT EXISTS punch_events (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES work_sessions(id),
  worker_id UUID NOT NULL REFERENCES employees(id),
  action TEXT NOT NULL CHECK(action IN ('clock_in','pause_start','pause_end','clock_out','admin_correct','admin_approve')),
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS punch_event_session_idx ON punch_events(session_id, happened_at);
CREATE TABLE IF NOT EXISTS absences (
  id UUID PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES employees(id),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  CHECK(to_date >= from_date)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  previous JSONB,
  next JSONB
);
CREATE INDEX IF NOT EXISTS audit_created_at_idx ON audit_log(created_at DESC);
-- Return the same result to retried requests; unique key is scoped to authenticated actor.
CREATE TABLE IF NOT EXISTS request_receipts (
  actor TEXT NOT NULL,
  request_id UUID NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(actor,request_id)
);
CREATE INDEX IF NOT EXISTS request_receipt_age_idx ON request_receipts(created_at);
COMMIT;
