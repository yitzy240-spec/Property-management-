-- Ordered guest-facing links shown on the check-in page.
-- Shape: [{ "label": string, "url": string, "hide_until_revealed": boolean }]
ALTER TABLE properties ADD COLUMN guest_links JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN properties.guest_links IS 'Ordered guest-facing links [{label,url,hide_until_revealed}] shown on the check-in page.';
