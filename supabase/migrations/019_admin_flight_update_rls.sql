-- =====================================================================
-- BrandoRides — Admin manual flight update RLS
-- =====================================================================
-- The admin panel runs RLS-only (no service role key, per the Phase 6
-- architecture decision) — it needs to write flight_checks and
-- pending_notifications rows directly from the admin's own authenticated
-- session when doing a manual flight status update, same as any other
-- admin write in this schema.
CREATE POLICY "Admins can log flight checks" ON flight_checks FOR INSERT
  TO authenticated WITH CHECK (is_admin());

CREATE POLICY "Admins can create pending notifications" ON pending_notifications FOR INSERT
  TO authenticated WITH CHECK (is_admin());
