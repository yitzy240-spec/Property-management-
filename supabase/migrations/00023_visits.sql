-- ApartmentOS: Visit management for routine property inspections
-- Admin logs visits on a 2-week cycle, owners see completed visit reports

CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  visited_at DATE NOT NULL DEFAULT CURRENT_DATE,
  checklist JSONB NOT NULL DEFAULT '{}',
  note TEXT,                              -- public note visible to owner
  admin_note TEXT,                        -- private note, admin only
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visit_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,                -- Supabase Storage path
  file_type TEXT NOT NULL DEFAULT 'image', -- 'image' or 'video'
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_media ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admin full access on visits" ON visits FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin full access on visit_media" ON visit_media FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Owners: read visits for their properties
CREATE POLICY "Owners read own visits" ON visits FOR SELECT
  USING (
    property_id IN (
      SELECT p.id FROM properties p
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );

-- Owners: read public media for their properties
CREATE POLICY "Owners read public visit media" ON visit_media FOR SELECT
  USING (
    is_private = false
    AND visit_id IN (
      SELECT v.id FROM visits v
      JOIN properties p ON v.property_id = p.id
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_visits_property ON visits(property_id);
CREATE INDEX idx_visits_visited_at ON visits(visited_at);
CREATE INDEX idx_visit_media_visit ON visit_media(visit_id);

-- Storage bucket for visit media
INSERT INTO storage.buckets (id, name, public)
VALUES ('visit-media', 'visit-media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Admin upload visit media" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'visit-media' AND is_admin());

CREATE POLICY "Admin delete visit media" ON storage.objects FOR DELETE
  USING (bucket_id = 'visit-media' AND is_admin());

CREATE POLICY "Admin read visit media" ON storage.objects FOR SELECT
  USING (bucket_id = 'visit-media' AND is_admin());

CREATE POLICY "Owners read public visit media storage" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'visit-media'
    AND (storage.foldername(name))[1] IN (
      SELECT p.id::text FROM properties p
      JOIN owners o ON p.owner_id = o.id
      WHERE o.auth_user_id = auth.uid()
    )
  );
