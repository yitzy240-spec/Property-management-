-- Add flag to exclude properties from visit tracking
-- Used for properties like personal apartments that don't need routine visits

ALTER TABLE properties ADD COLUMN IF NOT EXISTS exclude_from_visits BOOLEAN NOT NULL DEFAULT false;
