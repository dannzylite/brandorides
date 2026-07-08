import { supabase } from '@/lib/supabase'
import type {
  DriverAvailability,
  DriverProfile,
  FlightCheck,
  MissedConnectionRequest,
  NotificationLog,
  OfferStatus,
  Profile,
  Ride,
  RidePassenger,
  RideStatus,
  StudentProfile,
} from '@/types'

export async function fetchRides(): Promise<Ride[]> {
  const { data, error } = await supabase.from('rides').select('*').order('departure_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Ride[]
}

export async function fetchRidesByDriver(driverId: string): Promise<Ride[]> {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', driverId)
    .order('departure_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Ride[]
}

export async function fetchRideById(rideId: string): Promise<Ride | null> {
  const { data, error } = await supabase.from('rides').select('*').eq('id', rideId).maybeSingle()
  if (error) throw error
  return data as Ride | null
}

export async function fetchRidePassengers(rideId: string): Promise<(RidePassenger & { profile: Profile | null })[]> {
  const { data, error } = await supabase.from('ride_passengers').select('*').eq('ride_id', rideId)
  if (error) throw error
  const passengers = (data ?? []) as RidePassenger[]
  if (passengers.length === 0) return []

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .in(
      'id',
      passengers.map((p) => p.student_id)
    )
  if (profileError) throw profileError
  const profileMap = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]))

  return passengers.map((p) => ({ ...p, profile: profileMap.get(p.student_id) ?? null }))
}

export async function fetchDriverProfileById(driverId: string): Promise<(DriverProfile & { profile: Profile | null }) | null> {
  const [{ data: driverProfile, error: driverError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.from('driver_profiles').select('*').eq('id', driverId).maybeSingle(),
    supabase.from('profiles').select('*').eq('id', driverId).maybeSingle(),
  ])
  if (driverError) throw driverError
  if (profileError) throw profileError
  if (!driverProfile) return null
  return { ...(driverProfile as DriverProfile), profile: (profile as Profile) ?? null }
}

export async function fetchAllDrivers(): Promise<(DriverProfile & { profile: Profile | null })[]> {
  const { data: driverProfiles, error } = await supabase.from('driver_profiles').select('*')
  if (error) throw error
  const drivers = (driverProfiles ?? []) as DriverProfile[]
  if (drivers.length === 0) return []

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .in('id', drivers.map((d) => d.id))
  if (profileError) throw profileError
  const profileMap = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]))

  return drivers.map((d) => ({ ...d, profile: profileMap.get(d.id) ?? null }))
}

export async function fetchApprovedAvailableDriverIdsToday(): Promise<Set<string>> {
  const todayDow = new Date().getDay()
  const todayIso = new Date().toISOString().slice(0, 10)

  const { data: availability, error } = await supabase
    .from('driver_availability')
    .select('driver_id, is_blackout, day_of_week, blackout_date')
  if (error) throw error

  const rows = (availability ?? []) as DriverAvailability[]
  const availableToday = new Set(rows.filter((r) => !r.is_blackout && r.day_of_week === todayDow).map((r) => r.driver_id))
  const blackoutToday = new Set(rows.filter((r) => r.is_blackout && r.blackout_date === todayIso).map((r) => r.driver_id))

  for (const id of blackoutToday) availableToday.delete(id)
  return availableToday
}

export async function fetchDriverAvailability(driverId: string): Promise<DriverAvailability[]> {
  const { data, error } = await supabase.from('driver_availability').select('*').eq('driver_id', driverId)
  if (error) throw error
  return (data ?? []) as DriverAvailability[]
}

export async function approveDriver(driverId: string): Promise<void> {
  const { error } = await supabase.from('driver_profiles').update({ is_approved: true }).eq('id', driverId)
  if (error) throw error

  await supabase.from('notifications_log').insert({
    recipient_id: driverId,
    type: 'driver_approved',
    channel: 'in_app',
    message: "You're approved to drive with BrandoRides!",
  })
}

export async function rejectDriver(driverId: string, reason: string): Promise<void> {
  // is_approved simply stays false — there's no separate "rejected" state
  // in the schema, so rejection is communicated via the notification log
  // rather than a new column.
  const { error } = await supabase.from('notifications_log').insert({
    recipient_id: driverId,
    type: 'driver_rejected',
    channel: 'in_app',
    message: reason,
  })
  if (error) throw error
}

export async function fetchStudents(): Promise<(StudentProfile & { profile: Profile | null })[]> {
  const { data: studentProfiles, error } = await supabase.from('student_profiles').select('*')
  if (error) throw error
  const students = (studentProfiles ?? []) as StudentProfile[]
  if (students.length === 0) return []

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .in('id', students.map((s) => s.id))
  if (profileError) throw profileError
  const profileMap = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]))

  return students.map((s) => ({ ...s, profile: profileMap.get(s.id) ?? null }))
}

export async function fetchRidePassengersByStudent(studentId: string): Promise<RidePassenger[]> {
  const { data, error } = await supabase.from('ride_passengers').select('*').eq('student_id', studentId)
  if (error) throw error
  return (data ?? []) as RidePassenger[]
}

export async function fetchAllRidePassengers(): Promise<RidePassenger[]> {
  const { data, error } = await supabase.from('ride_passengers').select('*')
  if (error) throw error
  return (data ?? []) as RidePassenger[]
}

export async function fetchRidesByIds(rideIds: string[]): Promise<Ride[]> {
  if (rideIds.length === 0) return []
  const { data, error } = await supabase.from('rides').select('*').in('id', rideIds)
  if (error) throw error
  return (data ?? []) as Ride[]
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*')
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function fetchNotifications(): Promise<NotificationLog[]> {
  const { data, error } = await supabase.from('notifications_log').select('*').order('sent_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as NotificationLog[]
}

export async function updateRideStatus(rideId: string, status: RideStatus): Promise<void> {
  const { error } = await supabase.from('rides').update({ status }).eq('id', rideId)
  if (error) throw error
}

// Manual assignment bypasses the normal offer/accept flow entirely — the
// admin directly sets driver_id + confirms the ride, then logs a
// notification for the driver and every current passenger. There's no
// real push/SMS/email dispatch built yet (Twilio/Resend aren't wired
// up), so "notify" here means writing the notifications_log row that
// represents the event, same scope as the rest of this schema so far.
export async function assignDriverToRide(rideId: string, driverId: string): Promise<void> {
  const { error } = await supabase.from('rides').update({ driver_id: driverId, status: 'confirmed' }).eq('id', rideId)
  if (error) throw error

  const { data: passengers } = await supabase.from('ride_passengers').select('student_id').eq('ride_id', rideId)
  const recipientIds = [driverId, ...((passengers ?? []) as { student_id: string }[]).map((p) => p.student_id)]

  await supabase.from('notifications_log').insert(
    recipientIds.map((recipientId) => ({
      recipient_id: recipientId,
      ride_id: rideId,
      type: 'driver_assigned',
      channel: 'in_app' as const,
      message:
        recipientId === driverId
          ? 'You have been assigned to a new ride by an admin.'
          : 'A driver has been assigned to your ride.',
    }))
  )
}

export async function fetchOfferStatusCounts(rideId: string): Promise<{ status: OfferStatus; count: number }[]> {
  const { data, error } = await supabase.from('trip_offers').select('status').eq('ride_id', rideId)
  if (error) throw error
  const counts = new Map<OfferStatus, number>()
  for (const row of (data ?? []) as { status: OfferStatus }[]) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([status, count]) => ({ status, count }))
}

export async function fetchNotificationsForRide(rideId: string): Promise<NotificationLog[]> {
  const { data, error } = await supabase
    .from('notifications_log')
    .select('*')
    .eq('ride_id', rideId)
    .order('sent_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as NotificationLog[]
}

export function getDocumentUrl(
  bucket: 'student-docs' | 'driver-docs',
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  return supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)
    .then(({ data, error }) => (error ? null : data.signedUrl))
}

async function notifyAllOnRide(rideId: string, type: string, data: Record<string, unknown>): Promise<void> {
  const [{ data: ride }, { data: passengers }] = await Promise.all([
    supabase.from('rides').select('driver_id').eq('id', rideId).maybeSingle(),
    supabase.from('ride_passengers').select('student_id').eq('ride_id', rideId),
  ])

  const rows: { ride_id: string; type: string; recipient_role: 'student' | 'driver'; data: Record<string, unknown> }[] = []
  if (ride?.driver_id) rows.push({ ride_id: rideId, type, recipient_role: 'driver', data })
  for (const p of (passengers ?? []) as { student_id: string }[]) {
    rows.push({ ride_id: rideId, type, recipient_role: 'student', data: { ...data, student_id: p.student_id } })
  }
  if (rows.length > 0) await supabase.from('pending_notifications').insert(rows)
}

export interface FlightUpdateInput {
  // A missed-connection resolution replaces the flight entirely, not just
  // its timing — these are optional so a plain delay/cancellation update
  // on the *same* flight can omit them and leave the identity untouched.
  flightNumber?: string
  originCity?: string
  originCode?: string
  departureDate?: string // YYYY-MM-DD
  departureTime?: string // ISO
  estimatedLanding: string // ISO
  flightStatus: Ride['flight_status']
  notes: string
}

// The manual fallback for when the API returns 'unknown', or a student
// reports a missed connection — this is the admin's own equivalent of
// what flight-monitor does automatically, minus the AviationStack call
// (the admin already has the corrected number from validateFlight or
// from the student's report).
export async function updateFlightStatus(rideId: string, input: FlightUpdateInput): Promise<void> {
  const driverLeaveTime = new Date(new Date(input.estimatedLanding).getTime() - 60 * 60000).toISOString()

  const rideUpdate: Partial<Ride> = {
    estimated_landing: input.estimatedLanding,
    driver_leave_time: driverLeaveTime,
    flight_status: input.flightStatus,
  }
  if (input.flightNumber) rideUpdate.flight_number = input.flightNumber
  if (input.originCity) {
    rideUpdate.flight_origin = input.originCity
    rideUpdate.flight_origin_city = input.originCity
  }
  if (input.originCode) rideUpdate.flight_origin_code = input.originCode
  if (input.departureDate) rideUpdate.departure_date = input.departureDate
  if (input.departureTime) rideUpdate.departure_time = input.departureTime
  if (input.flightStatus === 'cancelled') rideUpdate.status = 'cancelled'
  if (input.flightStatus === 'landed') rideUpdate.actual_landing = new Date().toISOString()

  const { error: rideError } = await supabase.from('rides').update(rideUpdate).eq('id', rideId)
  if (rideError) throw rideError

  if (input.flightStatus === 'landed') {
    await supabase.from('ride_passengers').update({ student_status: 'landed' }).eq('ride_id', rideId)
  }

  await supabase.from('flight_checks').insert({
    ride_id: rideId,
    check_type: 'manual_admin_update',
    flight_status: input.flightStatus,
    estimated_landing_at_check: input.estimatedLanding,
    action_taken: input.flightStatus === 'cancelled' ? 'cancelled' : 'updated_time',
    raw_response: { notes: input.notes, source: 'admin_manual_update' },
  })

  if (input.flightStatus === 'delayed') {
    await notifyAllOnRide(rideId, 'FLIGHT_DELAYED', { message: 'Your flight time was updated by BrandoRides.', new_estimated_landing: input.estimatedLanding })
  } else if (input.flightStatus === 'landed') {
    await notifyAllOnRide(rideId, 'FLIGHT_LANDED', { message: 'Your flight has landed.' })
  } else if (input.flightStatus === 'cancelled') {
    await notifyAllOnRide(rideId, 'FLIGHT_CANCELLED', { message: 'This flight has been cancelled.' })
  }

  // Applying an update *is* how a missed-connection report gets resolved —
  // auto-close any still-pending ones for this ride rather than leaving a
  // separate, easy-to-forget "Mark Resolved" click as the only way.
  await supabase.from('missed_connection_requests').update({ status: 'resolved' }).eq('ride_id', rideId).eq('status', 'pending')
}

export async function fetchMissedConnectionRequests(rideId: string): Promise<MissedConnectionRequest[]> {
  const { data, error } = await supabase
    .from('missed_connection_requests')
    .select('*')
    .eq('ride_id', rideId)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as MissedConnectionRequest[]
}

export async function resolveMissedConnectionRequest(id: string): Promise<void> {
  const { error } = await supabase.from('missed_connection_requests').update({ status: 'resolved' }).eq('id', id)
  if (error) throw error
}

export async function fetchFlightChecks(rideId: string): Promise<FlightCheck[]> {
  const { data, error } = await supabase
    .from('flight_checks')
    .select('*')
    .eq('ride_id', rideId)
    .order('checked_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FlightCheck[]
}
