-- =====================================================================
-- BrandoRides — Flight Tracking Integration (Phase 7)
-- =====================================================================
-- actual_landing and driver_leave_time already exist on rides (added in
-- 001, never populated until now). Only genuinely new columns below.

CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE rides ADD COLUMN departure_time TIMESTAMPTZ;
ALTER TABLE rides ADD COLUMN flight_origin_city TEXT;
ALTER TABLE rides ADD COLUMN flight_origin_code TEXT;
ALTER TABLE rides ADD COLUMN flight_status TEXT NOT NULL DEFAULT 'scheduled'
  CHECK (flight_status IN ('scheduled', 'departed', 'landed', 'delayed', 'cancelled', 'unknown'));

-- =====================================================================
-- flight_checks — audit log of every AviationStack call (or admin
-- override) made against a ride. check_type distinguishes the 3 call
-- sites: booking-time validation, the pre-departure safety check
-- (driver_leave_time - 30min), the departure check, and manual admin
-- overrides when the API returns unknown.
-- =====================================================================
CREATE TABLE flight_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_type TEXT NOT NULL
    CHECK (check_type IN ('validation', 'pre_departure_check', 'departure_check', 'manual_admin_update')),
  flight_status TEXT NOT NULL,
  estimated_landing_at_check TIMESTAMPTZ,
  actual_landing_at_check TIMESTAMPTZ,
  delay_minutes INTEGER DEFAULT 0,
  action_taken TEXT NOT NULL
    CHECK (action_taken IN ('none', 'updated_time', 'cancelled', 'notified', 'admin_alert')),
  raw_response JSONB
);
CREATE INDEX idx_flight_checks_ride_id ON flight_checks(ride_id);

ALTER TABLE flight_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to flight_checks" ON flight_checks
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view all flight checks" ON flight_checks FOR SELECT
  USING (is_admin());
-- Students log their own 'validation' row at booking-confirm time,
-- right after their ride_passengers row exists — mirrors the existing
-- pattern of students writing rides/ride_passengers directly rather
-- than through a SECURITY DEFINER RPC, scoped by passenger membership.
CREATE POLICY "Students can log their own booking validation" ON flight_checks FOR INSERT
  TO authenticated
  WITH CHECK (
    check_type = 'validation'
    AND EXISTS (SELECT 1 FROM ride_passengers WHERE ride_id = flight_checks.ride_id AND student_id = auth.uid())
  );
CREATE POLICY "Students can view flight checks for their ride" ON flight_checks FOR SELECT
  USING (EXISTS (SELECT 1 FROM ride_passengers WHERE ride_id = flight_checks.ride_id AND student_id = auth.uid()));
CREATE POLICY "Drivers can view flight checks for their ride" ON flight_checks FOR SELECT
  USING (EXISTS (SELECT 1 FROM rides WHERE id = flight_checks.ride_id AND driver_id = auth.uid()));

-- =====================================================================
-- pending_notifications — bridge table for Phase 9 (notifications isn't
-- built yet). flight-monitor and the landing-detection job write rows
-- here instead of sending anything themselves.
-- =====================================================================
CREATE TABLE pending_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID REFERENCES rides(id),
  type TEXT NOT NULL,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('student', 'driver', 'admin')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE
);

ALTER TABLE pending_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to pending_notifications" ON pending_notifications
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view pending notifications" ON pending_notifications FOR SELECT
  USING (is_admin());

-- =====================================================================
-- missed_connection_requests — student-submitted "my flight changed"
-- reports, reviewed and resolved manually by an admin (validateFlight
-- + admin's own "Update Flight" action from the admin panel).
-- =====================================================================
CREATE TABLE missed_connection_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id),
  old_flight_number TEXT NOT NULL,
  new_flight_number TEXT NOT NULL,
  new_date DATE NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved'))
);

ALTER TABLE missed_connection_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can submit their own missed connection request" ON missed_connection_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (SELECT 1 FROM ride_passengers WHERE ride_id = missed_connection_requests.ride_id AND student_id = auth.uid())
  );
CREATE POLICY "Students can view their own missed connection requests" ON missed_connection_requests FOR SELECT
  USING (student_id = auth.uid());
CREATE POLICY "Admins can view all missed connection requests" ON missed_connection_requests FOR SELECT
  USING (is_admin());
CREATE POLICY "Admins can update missed connection requests" ON missed_connection_requests FOR UPDATE
  USING (is_admin()) WITH CHECK (is_admin());

-- =====================================================================
-- Landing detection — pure time comparison, zero API calls. A separate,
-- tighter (10 min) cron loop from the 30 min flight-monitor tick, since
-- it's free and UX benefits from noticing a landing promptly.
-- =====================================================================
CREATE OR REPLACE FUNCTION detect_landed_flights()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride RECORD;
BEGIN
  FOR v_ride IN
    SELECT id FROM rides
    WHERE flight_status IN ('departed', 'delayed')
      AND estimated_landing < NOW()
      AND actual_landing IS NULL
      AND status NOT IN ('completed', 'cancelled')
  LOOP
    UPDATE rides SET flight_status = 'landed', actual_landing = NOW() WHERE id = v_ride.id;
    UPDATE ride_passengers SET student_status = 'landed' WHERE ride_id = v_ride.id;

    INSERT INTO pending_notifications (ride_id, type, recipient_role, data)
    SELECT v_ride.id, 'FLIGHT_LANDED', 'student', jsonb_build_object('ride_id', v_ride.id, 'student_id', rp.student_id)
    FROM ride_passengers rp WHERE rp.ride_id = v_ride.id;
  END LOOP;
END;
$$;

SELECT cron.schedule('detect-landed-flights', '*/10 * * * *', $$SELECT detect_landed_flights();$$);
