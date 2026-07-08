import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { endOfWeek, startOfWeek } from 'date-fns';
import { AppState } from 'react-native';
import { PRICING } from '@/constants';
import type {
  DriverAvailability,
  DriverProfile,
  Profile,
  Ride,
  RidePassenger,
  StudentProfile,
  TimePreference,
  TripOffer,
} from '@/types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// supabase-js's default AsyncStorage key, derived the same way the SDK does
// internally. signOut() must load (and, if expired, refresh) the session
// before it can clear it — if that refresh call stalls on a bad connection,
// signOut() never resolves. forceClearLocalSession() lets callers wipe the
// persisted session directly so a stalled network call can't block logout
// or leave a stale session to resurrect the user on next launch.
const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

export async function forceClearLocalSession() {
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}

// Keeps the session's token-refresh timer accurate to the app's actual
// foreground/background state, per Supabase's React Native guidance.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function getDriverProfile(userId: string): Promise<DriverProfile | null> {
  const { data, error } = await supabase.from('driver_profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as DriverProfile | null;
}

export async function getStudentProfile(userId: string): Promise<StudentProfile | null> {
  const { data, error } = await supabase.from('student_profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as StudentProfile | null;
}

export async function updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single();
  if (error) throw error;
  return data as Profile;
}

interface PickedFile {
  uri: string;
  mimeType?: string | null;
}

// Buckets are private; documents live at "<user_id>/<doc-name>.<ext>" so
// storage RLS can key off the first path segment matching auth.uid().
export async function uploadDocument(
  bucket: 'student-docs' | 'driver-docs',
  path: string,
  file: PickedFile
): Promise<void> {
  const response = await fetch(file.uri);
  // .arrayBuffer() rather than .blob() — supabase-js + RN blob() has known
  // truncation issues on Android.
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
    contentType: file.mimeType ?? 'application/octet-stream',
    upsert: true,
  });
  if (error) throw error;
}

// Buckets are private, so callers need a signed URL, not a public one.
// Store the raw path in the DB and resolve it to a URL only when needed —
// signed URLs expire, paths don't.
export async function getDocumentUrl(
  bucket: 'student-docs' | 'driver-docs',
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

export async function getDriverAvailability(driverId: string): Promise<DriverAvailability[]> {
  const { data, error } = await supabase.from('driver_availability').select('*').eq('driver_id', driverId);
  if (error) throw error;
  return (data ?? []) as DriverAvailability[];
}

// No UNIQUE(driver_id, day_of_week) constraint exists to .upsert() against,
// so this is read-then-write: delete the row for `available=false`, or
// insert/update it for `available=true`.
export async function setDayAvailability(
  driverId: string,
  dayOfWeek: number,
  available: boolean,
  preference: TimePreference = 'flexible'
): Promise<void> {
  if (!available) {
    const { error } = await supabase
      .from('driver_availability')
      .delete()
      .eq('driver_id', driverId)
      .eq('is_blackout', false)
      .eq('day_of_week', dayOfWeek);
    if (error) throw error;
    return;
  }

  const { data: existing, error: fetchError } = await supabase
    .from('driver_availability')
    .select('id')
    .eq('driver_id', driverId)
    .eq('is_blackout', false)
    .eq('day_of_week', dayOfWeek)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing) {
    const { error } = await supabase
      .from('driver_availability')
      .update({ time_preference: preference })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('driver_availability')
      .insert({ driver_id: driverId, is_blackout: false, day_of_week: dayOfWeek, time_preference: preference });
    if (error) throw error;
  }
}

export async function addBlackoutDate(driverId: string, date: string): Promise<DriverAvailability> {
  const { data: existing, error: fetchError } = await supabase
    .from('driver_availability')
    .select('*')
    .eq('driver_id', driverId)
    .eq('is_blackout', true)
    .eq('blackout_date', date)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing as DriverAvailability;

  const { data, error } = await supabase
    .from('driver_availability')
    .insert({ driver_id: driverId, is_blackout: true, blackout_date: date })
    .select()
    .single();
  if (error) throw error;
  return data as DriverAvailability;
}

export async function removeBlackoutDate(driverId: string, availabilityId: string): Promise<void> {
  const { error } = await supabase
    .from('driver_availability')
    .delete()
    .eq('id', availabilityId)
    .eq('driver_id', driverId);
  if (error) throw error;
}

const UPCOMING_TRIP_STATUSES = ['confirmed', 'driver_en_route', 'at_airport', 'in_progress'];

export async function getUpcomingTrips(driverId: string): Promise<Ride[]> {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', driverId)
    .in('status', UPCOMING_TRIP_STATUSES)
    .order('departure_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Ride[];
}

export async function getPendingOffers(driverId: string): Promise<TripOffer[]> {
  const { data, error } = await supabase
    .from('trip_offers')
    .select('*')
    .eq('driver_id', driverId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('offered_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TripOffer[];
}

export interface AcceptOfferResult {
  success: boolean;
  reason: string | null;
}

// Acceptance has a real race condition (two drivers could hold a pending
// offer for the same ride) — this must go through the atomic
// accept_trip_offer() RPC, not a plain client UPDATE. See 009_trip_offer_acceptance.sql.
export async function acceptTripOffer(offerId: string): Promise<AcceptOfferResult> {
  const { data, error } = await supabase.rpc('accept_trip_offer', { p_offer_id: offerId });
  if (error) throw error;
  const result = (data as AcceptOfferResult[])?.[0];
  return result ?? { success: false, reason: 'unknown' };
}

export async function declineTripOffer(offerId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_offers')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', offerId);
  if (error) throw error;
}

export async function getRideWithPassengers(
  rideId: string
): Promise<{ ride: Ride | null; passengers: RidePassenger[] }> {
  const [{ data: ride, error: rideError }, { data: passengers, error: passengersError }] = await Promise.all([
    supabase.from('rides').select('*').eq('id', rideId).maybeSingle(),
    supabase.from('ride_passengers').select('*').eq('ride_id', rideId),
  ]);
  if (rideError) throw rideError;
  if (passengersError) throw passengersError;
  return { ride: (ride as Ride) ?? null, passengers: (passengers ?? []) as RidePassenger[] };
}

// Computed live from completed rides' seat fares rather than trusting
// rides.driver_earnings, which nothing in the codebase ever populates.
export async function getWeeklyEarnings(driverId: string): Promise<number> {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 0 }).toISOString().slice(0, 10);
  const end = endOfWeek(now, { weekStartsOn: 0 }).toISOString().slice(0, 10);

  const { data: rides, error: ridesError } = await supabase
    .from('rides')
    .select('id')
    .eq('driver_id', driverId)
    .eq('status', 'completed')
    .gte('departure_date', start)
    .lte('departure_date', end);
  if (ridesError) throw ridesError;

  const rideIds = (rides ?? []).map((r) => r.id);
  if (rideIds.length === 0) return 0;

  const { data: passengers, error: passengersError } = await supabase
    .from('ride_passengers')
    .select('seat_fare, wait_fee_charged')
    .in('ride_id', rideIds);
  if (passengersError) throw passengersError;

  const totalFare = (passengers ?? []).reduce((sum, p) => sum + p.seat_fare + p.wait_fee_charged, 0);
  return Math.round(totalFare * (PRICING.driver_percent / 100));
}
