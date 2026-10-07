-- Guest WiFi credentials. Revealed on the guest page under the same rules as the entry codes.
ALTER TABLE properties ADD COLUMN wifi_name TEXT, ADD COLUMN wifi_password TEXT;
COMMENT ON COLUMN properties.wifi_name IS 'WiFi network name shown to guests once their entry code is revealed.';
COMMENT ON COLUMN properties.wifi_password IS 'WiFi password shown to guests once their entry code is revealed.';
