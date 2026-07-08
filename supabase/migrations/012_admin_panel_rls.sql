-- =====================================================================
-- BrandoRides — Admin Panel RLS Gaps
-- =====================================================================
-- The admin web app (Phase 6) authenticates as a real Supabase user with
-- role='admin' and uses the normal anon-key client — every read/write it
-- needs should go through is_admin()-scoped RLS (same pattern as the
-- rest of this schema), not a service-role backend proxy. Two gaps
-- found: driver_availability had no admin SELECT at all (only
-- service_role), and notifications_log had no admin INSERT (needed to
-- log "driver assigned" / "trip cancelled" / "driver rejected" events).

CREATE POLICY "Admins can view all availability" ON driver_availability FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert notifications" ON notifications_log FOR INSERT
  WITH CHECK (is_admin());

-- =====================================================================
-- Creating the first admin account (manual, one-time)
-- =====================================================================
-- There is no self-service way to become an admin — by design, since
-- profiles.role can only ever be set to 'student' or 'driver' at signup
-- (see handle_new_user() in 002_account_verification.sql), and only an
-- existing admin can promote someone via "Admins can update all
-- profiles". The very first admin has to be created by hand:
--
-- 1. In the Supabase Dashboard: Authentication -> Users -> Add user.
--    Create the account with an email + password (or invite by email).
-- 2. In the SQL Editor, promote that user to admin:
--
--      UPDATE profiles SET role = 'admin' WHERE id = '<the new user''s UUID>';
--
--    (Find the UUID on the Authentication -> Users page, or via
--    `SELECT id FROM auth.users WHERE email = '...';`)
--
-- That's it — they can now log into /admin with that email/password.
