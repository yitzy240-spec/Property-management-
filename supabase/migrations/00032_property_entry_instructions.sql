-- Per-apartment entry instructions, shown natively on the guest page under the live code.
ALTER TABLE properties ADD COLUMN entry_instructions TEXT;
COMMENT ON COLUMN properties.entry_instructions IS 'Apartment-specific entry steps shown to guests under their entry code.';
