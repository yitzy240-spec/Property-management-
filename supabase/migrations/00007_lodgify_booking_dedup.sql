-- ApartmentOS: Add index for Lodgify booking dedup
-- external_id stores 'lodgify_{id}' for Lodgify-synced bookings
-- This index enables fast lookups during sync upserts

CREATE INDEX IF NOT EXISTS idx_bookings_external_id
  ON bookings(property_id, external_id)
  WHERE external_id IS NOT NULL;
