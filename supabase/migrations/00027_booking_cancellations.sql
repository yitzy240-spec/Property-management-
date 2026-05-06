-- iCal feeds (Airbnb in particular) signal cancellations by SILENTLY
-- REMOVING the event from subsequent feed pulls. The previous sync
-- code only upserted incoming events, so cancelled bookings stayed
-- in the DB and inflated revenue / showed up in booking lists.
--
-- Add a soft-cancel flag instead of deleting the row, so we retain
-- history (commission already invoiced, statements already issued,
-- etc.) and can audit later. Sync logic in lib/ical-sync.ts marks
-- any UID present in the DB but absent from the latest feed pull
-- as is_cancelled=true.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Most queries (revenue breakdown, dashboard, property page) filter
-- to is_cancelled=false; partial index on the active subset keeps
-- those reads fast without indexing the (eventually large) cancelled tail.
CREATE INDEX IF NOT EXISTS idx_bookings_active
  ON bookings (property_id, check_in)
  WHERE is_cancelled = false;
