-- ApartmentOS: Store enrichment data from Lodgify
-- Photos, coordinates, room details, description pulled from Lodgify API

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS lodgify_data JSONB;

-- Add unique constraint for webhook booking upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_property_external
  ON bookings(property_id, external_id)
  WHERE external_id IS NOT NULL;
