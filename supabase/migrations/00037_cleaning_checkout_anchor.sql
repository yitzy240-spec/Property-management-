-- The checkout date a cleaning task was scheduled around. Set when the cron
-- creates the clean, and refreshed whenever a person/agent sets its date.
-- If the linked booking's checkout later moves (or the booking is cancelled),
-- the clean is stale: the cron replaces it — even if its date was set by hand
-- (schedule_locked) — instead of leaving it on the old day.
ALTER TABLE tasks ADD COLUMN checkout_anchor DATE;

UPDATE tasks t
SET checkout_anchor = b.check_out
FROM bookings b
WHERE t.booking_id = b.id
  AND t.is_cleaning
  AND t.checkout_anchor IS NULL;
