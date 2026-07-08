-- =====================================================================
-- BrandoRides — Fix RLS Recursion Between rides / ride_passengers
-- =====================================================================
-- 001 gave `rides` a policy that checks `ride_passengers`, and gave
-- `ride_passengers` a policy that checks `rides` right back. Postgres
-- has to fully expand both tables' RLS to plan either query, which
-- cycles forever and is rejected with "infinite recursion detected in
-- policy". `driver_profiles` and `driver_location` had the same
-- problem one level removed, since their policies joined both tables.
--
-- Fix: move each cross-table relationship check into a SECURITY
-- DEFINER function (same technique as is_admin() in 001) so the
-- lookup bypasses RLS on the table it reads, instead of re-triggering
-- that table's own policies.

CREATE OR REPLACE FUNCTION is_ride_passenger(p_ride_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ride_passengers
    WHERE ride_id = p_ride_id AND student_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_ride_driver(p_ride_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rides
    WHERE id = p_ride_id AND driver_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION student_has_approved_driver(p_driver_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rides r
    JOIN ride_passengers rp ON rp.ride_id = r.id
    WHERE r.driver_id = p_driver_id AND rp.student_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION student_has_active_driver(p_driver_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rides r
    JOIN ride_passengers rp ON rp.ride_id = r.id
    WHERE r.driver_id = p_driver_id
      AND rp.student_id = auth.uid()
      AND r.status IN ('driver_en_route', 'at_airport', 'in_progress')
  );
$$;

DROP POLICY "Students can view rides they are passengers on" ON rides;
CREATE POLICY "Students can view rides they are passengers on"
  ON rides FOR SELECT
  USING (is_ride_passenger(id));

DROP POLICY "Drivers can view passengers on assigned rides" ON ride_passengers;
CREATE POLICY "Drivers can view passengers on assigned rides"
  ON ride_passengers FOR SELECT
  USING (is_ride_driver(ride_id));

DROP POLICY "Students can view approved drivers for their rides" ON driver_profiles;
CREATE POLICY "Students can view approved drivers for their rides"
  ON driver_profiles FOR SELECT
  USING (is_approved = TRUE AND student_has_approved_driver(id));

DROP POLICY "Students can view their active driver's location" ON driver_location;
CREATE POLICY "Students can view their active driver's location"
  ON driver_location FOR SELECT
  USING (student_has_active_driver(driver_id));
