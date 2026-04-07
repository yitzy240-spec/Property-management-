-- In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users mark own as read" ON notifications FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin full access on notifications" ON notifications FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE NOT is_read;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
