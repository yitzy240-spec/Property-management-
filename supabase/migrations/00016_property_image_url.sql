-- Add custom image_url to properties (overrides Lodgify image)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS image_url TEXT;
