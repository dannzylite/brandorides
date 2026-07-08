-- =====================================================================
-- BrandoRides — Driver Availability Check
-- =====================================================================
-- Called by backend matching logic to evaluate ANY driver's availability
-- for a given date, not just the caller's own rows — needs SECURITY
-- DEFINER to bypass RLS (same justification as find_compatible_ride, 005).

CREATE OR REPLACE FUNCTION check_driver_available(p_driver_id UUID, p_trip_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_dow INT := EXTRACT(DOW FROM p_trip_date)::INT; -- 0=Sunday..6=Saturday
BEGIN
  IF EXISTS (
    SELECT 1 FROM driver_availability
    WHERE driver_id = p_driver_id AND is_blackout AND blackout_date = p_trip_date
  ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM driver_availability
    WHERE driver_id = p_driver_id AND NOT is_blackout AND day_of_week = v_dow
  ) THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM rides
    WHERE driver_id = p_driver_id
      AND departure_date = p_trip_date
      AND status IN ('confirmed', 'driver_en_route', 'at_airport', 'in_progress')
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;
