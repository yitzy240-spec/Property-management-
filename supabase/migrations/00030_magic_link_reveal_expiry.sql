-- Make expires_at nullable (NULL = never expires) and add code_reveals_at gate.
ALTER TABLE magic_links
  ALTER COLUMN expires_at DROP NOT NULL,
  ADD COLUMN code_reveals_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN magic_links.code_reveals_at IS
  'Server-side time gate for revealing entry_code on the guest page. NULL = reveal immediately.';
COMMENT ON COLUMN magic_links.expires_at IS
  'When the link stops working. NULL = never expires.';
