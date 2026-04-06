-- ApartmentOS: Hourly work log for billable time tracking
-- Admin logs hours per property, included in monthly invoice

CREATE TABLE IF NOT EXISTS work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hours NUMERIC(5,2) NOT NULL,          -- e.g. 2.5 = 2 hours 30 min
  description TEXT NOT NULL,             -- what was done
  billable BOOLEAN NOT NULL DEFAULT true,
  invoiced BOOLEAN NOT NULL DEFAULT false,
  invoice_id TEXT,                       -- Green Invoice document ID once invoiced
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on work_logs" ON work_logs FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE INDEX idx_work_logs_property ON work_logs(property_id);
CREATE INDEX idx_work_logs_date ON work_logs(date);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON work_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
