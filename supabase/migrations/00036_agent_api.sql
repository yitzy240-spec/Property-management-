-- Agent API (/api/agent/v1) — lets an external agent (Ariel's Grok Bot) read and
-- write ApartmentOS data with a scoped, revocable token. Tokens are stored only
-- as SHA-256 hashes; every agent write is recorded in agent_audit_log.

CREATE TABLE api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,          -- first characters, to recognise a token in the UI
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES api_tokens(id) ON DELETE SET NULL,
  token_name TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id UUID,
  action TEXT NOT NULL,                -- create | update | delete | read_codes
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agent_audit_log_created_at_idx ON agent_audit_log (created_at DESC);

-- Service-role only from the API; admins can view in Settings.
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage api tokens" ON api_tokens FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins read agent audit log" ON agent_audit_log FOR SELECT USING (is_admin());

-- Guest contact details (filled by the Lodgify sync; editable via the agent API).
ALTER TABLE bookings ADD COLUMN guest_email TEXT, ADD COLUMN guest_phone TEXT;

-- Cleaning tasks: link auto-created turnover cleans to their booking, and mark
-- tasks someone scheduled by hand. The cleaning cron's reconcile used to delete
-- ANY pending cleaning task not sitting on a checkout date — including ones an
-- admin (or the agent) deliberately moved — and then recreate a duplicate.
ALTER TABLE tasks
  ADD COLUMN booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  ADD COLUMN schedule_locked BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN tasks.schedule_locked IS 'True when the date was set by a person/agent; the cleaning cron never deletes or duplicates these.';

UPDATE tasks t
SET booking_id = b.id
FROM bookings b
WHERE t.is_cleaning
  AND t.booking_id IS NULL
  AND b.property_id = t.property_id
  AND b.check_out = t.due_date
  AND NOT b.is_cancelled;
