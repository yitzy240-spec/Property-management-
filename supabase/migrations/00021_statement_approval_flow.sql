-- Add approval workflow states to statement_status enum
ALTER TYPE statement_status ADD VALUE IF NOT EXISTS 'pending_approval' BEFORE 'sent';
ALTER TYPE statement_status ADD VALUE IF NOT EXISTS 'approved' BEFORE 'sent';

-- Add section column to statement_line_items for grouping
ALTER TABLE statement_line_items ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'fees';
-- Track manual edits
ALTER TABLE statement_line_items ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;

-- Add approval tracking to monthly_statements
ALTER TABLE monthly_statements ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE monthly_statements ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
