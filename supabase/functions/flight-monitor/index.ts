// BrandoRides — flight-monitor
//
// Woken every 30 minutes by a pg_cron tick (see migration 017). Queries
// the database only; AviationStack is called exactly once per matching
// ride, for two possible reasons:
//
//   Condition A (pre_departure_check) — driver_leave_time is within the
//   next 30 minutes and hasn't been pre-checked yet. Purpose: catch a
//   cancellation before the driver leaves Brandon for nothing.
//
//   Condition B (departure_check) — departure_time has passed and
//   hasn't been checked yet. Purpose: catch delays/cancellations right
//   as the flight leaves, so the landing estimate (and driver_leave_time)
//   can be corrected well before pickup.
//
// flight_checks is the idempotency guard for both — a ride already
// logged for a given check_type is never re-checked, so this can safely
// run forever without re-billing API calls.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AVIATIONSTACK_API_KEY = Deno.env.get('AVIATIONSTACK_API_KEY') ?? '';
const AVIATIONSTACK_BASE_URL = Deno.env.get('AVIATIONSTACK_BASE_URL') ?? 'http://api.aviationstack.com/v1';
const DELAYED_THRESHOLD_MINUTES = 10;
const LOOKAHEAD_MS = 30 * 60 * 1000;

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

interface RideRow {
  id: string;
  flight_number: string;
  departure_date: string;
  estimated_landing: string;
  driver_leave_time: string | null;
  driver_id: string | null;
}

interface CheckResult {
  status: 'on_time' | 'delayed' | 'cancelled' | 'landed' | 'unknown';
  estimatedLanding: string | null;
  actualLanding: string | null;
  delayMinutes: number;
  raw: unknown;
}

async function checkFlightStatus(flightNumber: string, date: string): Promise<CheckResult> {
  try {
    // flight_date as a query param is paid-tier-only on AviationStack's
    // free plan (confirmed live: function_access_restricted). Fetch by
    // flight_iata alone; the flight_date match below filters client-side.
    const url = `${AVIATIONSTACK_BASE_URL}/flights?access_key=${AVIATIONSTACK_API_KEY}&flight_iata=${encodeURIComponent(flightNumber)}`;
    const res = await fetch(url);
    const body = await res.json();
    if (body.error) throw new Error(body.error.message ?? 'AviationStack error');

    const match = (body.data ?? []).find((f: { flight_date: string }) => f.flight_date === date);
    if (!match) throw new Error(`No schedule data for ${flightNumber} on ${date}`);

    if (match.flight_status === 'cancelled') {
      return { status: 'cancelled', estimatedLanding: null, actualLanding: null, delayMinutes: 0, raw: match };
    }

    const scheduledArrival = new Date(match.arrival.scheduled);
    const estimatedArrival = new Date(match.arrival.estimated ?? match.arrival.scheduled);
    const actualArrival = match.arrival.actual ? new Date(match.arrival.actual) : null;
    const delayMinutes = Math.max(
      0,
      Math.round(((actualArrival ?? estimatedArrival).getTime() - scheduledArrival.getTime()) / 60000)
    );

    if (match.flight_status === 'landed' || actualArrival) {
      return {
        status: 'landed',
        estimatedLanding: estimatedArrival.toISOString(),
        actualLanding: actualArrival?.toISOString() ?? null,
        delayMinutes,
        raw: match,
      };
    }

    return {
      status: delayMinutes >= DELAYED_THRESHOLD_MINUTES ? 'delayed' : 'on_time',
      estimatedLanding: estimatedArrival.toISOString(),
      actualLanding: null,
      delayMinutes,
      raw: match,
    };
  } catch (err) {
    return { status: 'unknown', estimatedLanding: null, actualLanding: null, delayMinutes: 0, raw: { error: String(err) } };
  }
}

async function alreadyChecked(rideIds: string[], checkType: string): Promise<Set<string>> {
  if (rideIds.length === 0) return new Set();
  const { data } = await supabase.from('flight_checks').select('ride_id').eq('check_type', checkType).in('ride_id', rideIds);
  return new Set((data ?? []).map((r: { ride_id: string }) => r.ride_id));
}

async function logCheck(
  rideId: string,
  checkType: 'pre_departure_check' | 'departure_check',
  result: CheckResult,
  actionTaken: 'none' | 'updated_time' | 'cancelled' | 'admin_alert'
) {
  await supabase.from('flight_checks').insert({
    ride_id: rideId,
    check_type: checkType,
    flight_status: result.status,
    estimated_landing_at_check: result.estimatedLanding,
    actual_landing_at_check: result.actualLanding,
    delay_minutes: result.delayMinutes,
    action_taken: actionTaken,
    raw_response: result.raw,
  });
}

async function notify(rideId: string, type: string, recipientRole: 'student' | 'driver' | 'admin', data: Record<string, unknown>) {
  await supabase.from('pending_notifications').insert({ ride_id: rideId, type, recipient_role: recipientRole, data });
}

async function notifyAllOnRide(rideId: string, type: string, data: Record<string, unknown>) {
  const [{ data: ride }, { data: passengers }] = await Promise.all([
    supabase.from('rides').select('driver_id').eq('id', rideId).maybeSingle(),
    supabase.from('ride_passengers').select('student_id').eq('ride_id', rideId),
  ]);

  if (ride?.driver_id) await notify(rideId, type, 'driver', data);
  for (const p of (passengers ?? []) as { student_id: string }[]) {
    await notify(rideId, type, 'student', { ...data, student_id: p.student_id });
  }
}

async function cancelRide(rideId: string) {
  await supabase.from('rides').update({ status: 'cancelled', flight_status: 'cancelled' }).eq('id', rideId);
}

async function processPreDepartureCandidates() {
  const cutoff = new Date(Date.now() + LOOKAHEAD_MS).toISOString();
  const { data: candidates } = await supabase
    .from('rides')
    .select('id, flight_number, departure_date, estimated_landing, driver_leave_time, driver_id')
    .not('status', 'in', '(completed,cancelled)')
    .not('driver_leave_time', 'is', null)
    .lt('driver_leave_time', cutoff);

  const rides = (candidates ?? []) as RideRow[];
  if (rides.length === 0) return;

  const skip = await alreadyChecked(rides.map((r) => r.id), 'pre_departure_check');

  for (const ride of rides) {
    if (skip.has(ride.id)) continue;

    const result = await checkFlightStatus(ride.flight_number, ride.departure_date);

    if (result.status === 'cancelled') {
      await cancelRide(ride.id);
      await notifyAllOnRide(ride.id, 'FLIGHT_CANCELLED', {
        message: 'This flight has been cancelled before departure. Do not leave Brandon.',
      });
      await notify(ride.id, 'FLIGHT_CANCELLED', 'admin', { message: `Ride ${ride.id} cancelled pre-departure — flight cancelled. Manual refund review needed.` });
      await logCheck(ride.id, 'pre_departure_check', result, 'cancelled');
    } else if (result.status === 'unknown') {
      await notify(ride.id, 'FLIGHT_CHECK_FAILED', 'admin', {
        message: `Pre-departure flight check failed for ride ${ride.id}. Please check manually.`,
      });
      await logCheck(ride.id, 'pre_departure_check', result, 'admin_alert');
    } else {
      // On time (or any other non-cancelled state this early) — nothing
      // to change yet, the real delay handling happens at departure_check.
      await logCheck(ride.id, 'pre_departure_check', result, 'none');
    }
  }
}

async function processDepartureCandidates() {
  const now = new Date().toISOString();
  const { data: candidates } = await supabase
    .from('rides')
    .select('id, flight_number, departure_date, estimated_landing, driver_leave_time, driver_id')
    .not('status', 'in', '(completed,cancelled)')
    .not('departure_time', 'is', null)
    .lt('departure_time', now);

  const rides = (candidates ?? []) as RideRow[];
  if (rides.length === 0) return;

  const skip = await alreadyChecked(rides.map((r) => r.id), 'departure_check');

  for (const ride of rides) {
    if (skip.has(ride.id)) continue;

    const result = await checkFlightStatus(ride.flight_number, ride.departure_date);

    if (result.status === 'cancelled') {
      await cancelRide(ride.id);
      await notifyAllOnRide(ride.id, 'FLIGHT_CANCELLED', { message: 'This flight has been cancelled.' });
      await notify(ride.id, 'FLIGHT_CANCELLED', 'admin', { message: `Ride ${ride.id} cancelled — flight cancelled at departure check. Manual refund review needed.` });
      await logCheck(ride.id, 'departure_check', result, 'cancelled');
    } else if (result.status === 'delayed' && result.estimatedLanding) {
      const newLeaveTime = new Date(new Date(result.estimatedLanding).getTime() - 60 * 60000).toISOString();
      await supabase
        .from('rides')
        .update({ estimated_landing: result.estimatedLanding, driver_leave_time: newLeaveTime, flight_status: 'delayed' })
        .eq('id', ride.id);
      await notifyAllOnRide(ride.id, 'FLIGHT_DELAYED', {
        message: 'This flight has been delayed. Estimated landing and driver pickup time have been updated.',
        new_estimated_landing: result.estimatedLanding,
        delay_minutes: result.delayMinutes,
      });
      await logCheck(ride.id, 'departure_check', result, 'updated_time');
    } else if (result.status === 'landed') {
      // Rare (very short flight, or a late-running check) — landing
      // detection's own recurring job would catch this shortly anyway,
      // but update now since we already have the data in hand.
      await supabase
        .from('rides')
        .update({ flight_status: 'landed', actual_landing: result.actualLanding, estimated_landing: result.estimatedLanding ?? undefined })
        .eq('id', ride.id);
      await logCheck(ride.id, 'departure_check', result, 'updated_time');
    } else if (result.status === 'unknown') {
      await supabase.from('rides').update({ flight_status: 'unknown' }).eq('id', ride.id);
      await notify(ride.id, 'FLIGHT_CHECK_FAILED', 'admin', {
        message: `Flight check failed for ride ${ride.id}. Please check manually and update landing time if needed.`,
      });
      await logCheck(ride.id, 'departure_check', result, 'admin_alert');
    } else {
      // on_time
      await supabase.from('rides').update({ flight_status: 'departed' }).eq('id', ride.id);
      await logCheck(ride.id, 'departure_check', result, 'none');
    }
  }
}

Deno.serve(async () => {
  await processPreDepartureCandidates();
  await processDepartureCandidates();
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
