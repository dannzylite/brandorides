-- =====================================================================
-- BrandoRides — Missed connection submission
-- =====================================================================
-- Students have no INSERT policy on pending_notifications (it's locked
-- to service_role + admin, same as flight-monitor's writes) — submitting
-- a missed-connection report also needs to alert the admin, so this
-- wraps both inserts in one SECURITY DEFINER call rather than opening
-- pending_notifications up to direct student writes.
CREATE OR REPLACE FUNCTION submit_missed_connection_request(
  p_ride_id UUID,
  p_new_flight_number TEXT,
  p_new_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_flight_number TEXT;
  v_student_name TEXT;
  v_request_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ride_passengers WHERE ride_id = p_ride_id AND student_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not your booking';
  END IF;

  SELECT flight_number INTO v_old_flight_number FROM rides WHERE id = p_ride_id;
  SELECT full_name INTO v_student_name FROM profiles WHERE id = auth.uid();

  INSERT INTO missed_connection_requests (ride_id, student_id, old_flight_number, new_flight_number, new_date)
  VALUES (p_ride_id, auth.uid(), v_old_flight_number, p_new_flight_number, p_new_date)
  RETURNING id INTO v_request_id;

  INSERT INTO pending_notifications (ride_id, type, recipient_role, data)
  VALUES (
    p_ride_id,
    'MISSED_CONNECTION',
    'admin',
    jsonb_build_object(
      'message', format(
        'Student %s on ride %s has missed their connection. Old flight: %s. New flight: %s. Please review and update.',
        coalesce(v_student_name, 'Unknown'), p_ride_id, v_old_flight_number, p_new_flight_number
      ),
      'request_id', v_request_id,
      'old_flight_number', v_old_flight_number,
      'new_flight_number', p_new_flight_number,
      'new_date', p_new_date
    )
  );

  RETURN v_request_id;
END;
$$;
