-- Store the original (possibly non-ASCII) filename for vault documents.
-- The storage_path is now an opaque UUID-based key so we can't recover the
-- user's filename from it. This column lets download routes serve the file
-- with its original name (e.g., Hebrew filenames) via Content-Disposition.
--
-- Existing rows are left NULL — download falls back to `title` for those.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS original_filename TEXT;
