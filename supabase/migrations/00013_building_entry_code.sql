-- ApartmentOS: Separate building entry code
-- Some properties have a building door code AND an apartment lock code.
-- entry_code = apartment/unit lock (Simplex)
-- building_entry_code = front door / building entrance

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS building_entry_code TEXT;
