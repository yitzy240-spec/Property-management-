CREATE TABLE code_update_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id),
  apartment_code TEXT,
  building_code TEXT,
  property_ids UUID[] NOT NULL,
  update_canva BOOLEAN NOT NULL DEFAULT true,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_code_update_jobs_created_by ON code_update_jobs(created_by);

ALTER TABLE code_update_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on code_update_jobs" ON code_update_jobs FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

COMMENT ON COLUMN code_update_jobs.results IS
  'Per-property results: { [property_id]: { db: "ok"|"failed", canva: "ok"|"skipped"|"failed", message: string } }';
COMMENT ON COLUMN code_update_jobs.status IS 'running | done';
