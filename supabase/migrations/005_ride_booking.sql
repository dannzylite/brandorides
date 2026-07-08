-- =====================================================================
-- BrandoRides — Student Booking: RLS + Matching
-- =====================================================================
-- 001-003 never gave students write access to rides/ride_passengers at
-- all (only drivers/admins/service_role had any INSERT/UPDATE there),
-- and the only ride_passengers SELECT policy is "your own rows" — which
-- is correct for privacy, but blocks the cross-student luggage check
-- the shared-ride matching logic needs (a student can't see a stranger's
-- luggage count to decide if they'd fit in the same vehicle). That
-- matching therefore has to run server-side via a SECURITY DEFINER
-- function, not as a client-side query — same pattern as is_admin() etc.

-- Mirrors constants/index.ts's VEHICLE_CAPACITY.max_luggage_units.
-- Keep the two in sync if vehicle capacities ever change.
CREATE OR REPLACE FUNCTION vehicle_class_max_luggage(p_class vehicle_class)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_class
    WHEN 'sedan' THEN 6
    WHEN 'suv' THEN 10
    WHEN 'minivan' THEN 14
    WHEN 'truck' THEN 16
  END;
$$;

-- Returns the id of a compatible open shared ride for a new passenger, or
-- null. Runs as SECURITY DEFINER specifically so it can read other
-- students' luggage totals without exposing their rows to the caller.
CREATE OR REPLACE FUNCTION find_compatible_ride(
  p_departure_date DATE,
  p_estimated_landing TIMESTAMPTZ,
  p_luggage_units INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate RECORD;
  combined_units INT;
BEGIN
  FOR candidate IN
    SELECT r.id, r.vehicle_class_required
    FROM rides r
    WHERE r.status IN ('pending_driver', 'confirmed')
      AND r.ride_type = 'shared'
      AND r.departure_date = p_departure_date
      AND r.filled_seats < r.total_seats
      AND ABS(EXTRACT(EPOCH FROM (r.estimated_landing - p_estimated_landing))) <= 90 * 60
    ORDER BY r.created_at
  LOOP
    SELECT COALESCE(SUM(rp.luggage_units), 0) + p_luggage_units INTO combined_units
    FROM ride_passengers rp
    WHERE rp.ride_id = candidate.id;

    IF combined_units <= vehicle_class_max_luggage(candidate.vehicle_class_required) THEN
      RETURN candidate.id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- Defense in depth: even if application logic double-books a ride under
-- concurrent requests, the DB rejects exceeding capacity outright. The
-- filled_seats-updating trigger runs in the same transaction as the
-- ride_passengers insert, so this also naturally serializes concurrent
-- bookings on the same ride via ordinary row locking on the UPDATE.
ALTER TABLE rides ADD CONSTRAINT filled_seats_within_capacity CHECK (filled_seats <= total_seats);

-- Students can create a fresh, unclaimed ride shell (no driver, no
-- passengers yet) — the immediate next step in the booking flow is
-- always inserting themselves as its first passenger.
CREATE POLICY "Students can create new rides"
  ON rides FOR INSERT
  TO authenticated
  WITH CHECK (
    driver_id IS NULL
    AND status = 'pending_driver'
    AND filled_seats = 0
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student')
  );

-- Bridges the brief window between creating a ride and inserting the
-- creator's own ride_passengers row (needed for insert...select() to
-- return the new row, since the existing "passenger" SELECT policy can't
-- match until that second insert exists). Narrow on purpose: only
-- matches empty, unclaimed ride shells — no passenger or driver data is
-- ever exposed by this policy.
CREATE POLICY "Anyone can view freshly created open rides"
  ON rides FOR SELECT
  TO authenticated
  USING (driver_id IS NULL AND status = 'pending_driver' AND filled_seats = 0);

-- Students book themselves onto a ride (new or existing-compatible).
CREATE POLICY "Students can insert own passenger record"
  ON ride_passengers FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Students update their own trip-progress status (e.g. "I'm at
-- Arrivals"). Payment-related columns are separately protected below —
-- this policy alone would otherwise let a student edit their own fare.
CREATE POLICY "Students can update own passenger status"
  ON ride_passengers FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Cancelling a booking gives up the seat (deletes the passenger row);
-- the underlying ride is left as-is for any other passengers.
CREATE POLICY "Students can delete own passenger record"
  ON ride_passengers FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

CREATE OR REPLACE FUNCTION protect_ride_passenger_payment_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.payment_status IS DISTINCT FROM OLD.payment_status
      OR NEW.seat_fare IS DISTINCT FROM OLD.seat_fare
      OR NEW.wait_fee_charged IS DISTINCT FROM OLD.wait_fee_charged
      OR NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id)
     AND NOT (is_admin() OR auth.role() = 'service_role')
  THEN
    RAISE EXCEPTION 'Only admins or the service role can change payment fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_ride_passenger_payment_fields
  BEFORE UPDATE ON ride_passengers
  FOR EACH ROW
  EXECUTE FUNCTION protect_ride_passenger_payment_fields();
