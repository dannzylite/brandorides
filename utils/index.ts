import { format, isValid } from 'date-fns';
import { EARNINGS_PROJECTION, LUGGAGE_UNITS, PRICING, TIMING, VEHICLE_CAPACITY } from '@/constants';
import { supabase } from '@/lib/supabase';
import type { DriverProfile, Ride, RideStatus, RideType, VehicleClass } from '@/types';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Postgres DATE columns (e.g. departure_date, blackout_date) have no time
// component. `new Date("2026-07-04")` parses that as UTC midnight, which
// renders/computes as the *previous* day in any timezone behind UTC —
// including things like .getDay() for weekday checks, not just display.
// Parse date-only strings as local midnight instead; anything else
// (TIMESTAMPTZ strings, which already carry a real offset) passes through
// the normal `new Date(value)` path untouched.
export function parseDateOnly(value: string): Date {
  const match = DATE_ONLY_PATTERN.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
}

// Formats a date/time string defensively — external API data (or a stale
// cached shape from before a field existed) can be missing or malformed,
// and a raw `format(new Date(x), ...)` throws on that instead of just
// rendering a placeholder.
export function safeFormat(value: string | null | undefined, pattern: string, fallback = '—'): string {
  if (!value) return fallback;
  const date = parseDateOnly(value);
  return isValid(date) ? format(date, pattern) : fallback;
}

export function rideStatusLabel(status: RideStatus): string {
  switch (status) {
    case 'pending_driver':
      return 'Finding Driver';
    case 'confirmed':
      return 'Driver Confirmed';
    case 'driver_en_route':
      return 'Driver En Route';
    case 'at_airport':
      return 'Driver At Airport';
    case 'in_progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
  }
}

export function rideStatusVariant(status: RideStatus): 'success' | 'warning' | 'info' | 'danger' | 'neutral' {
  switch (status) {
    case 'pending_driver':
      return 'warning';
    case 'confirmed':
    case 'driver_en_route':
    case 'at_airport':
    case 'in_progress':
      return 'info';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
  }
}

// A ride stuck in 'pending_driver' past its own pickup window never got a
// driver in time and never will — nothing re-broadcasts it past its flight's
// departure_date (see rebroadcast_stale_ride_offers() in migration 014).
// Deliberately keyed off estimated_landing (a real timestamp), not
// departure_date (a bare calendar date): a flight that landed at 3pm and
// still has no driver at 9pm the *same* day is already expired — waiting
// for the calendar day to roll over is much too coarse. +60min matches the
// same pickup-window-end this screen already shows for a confirmed ride.
export function isPendingRideExpired(ride: Pick<Ride, 'status' | 'estimated_landing'>): boolean {
  if (ride.status !== 'pending_driver') return false;
  const pickupWindowEnd = new Date(ride.estimated_landing).getTime() + 60 * 60000;
  return Date.now() > pickupWindowEnd;
}

const VEHICLE_CLASS_ORDER: VehicleClass[] = ['sedan', 'suv', 'minivan', 'truck'];

export function calculateLuggageUnits(largeBags: number, carryOns: number, oversized: boolean): number {
  return (
    largeBags * LUGGAGE_UNITS.large_bag +
    carryOns * LUGGAGE_UNITS.carry_on +
    (oversized ? LUGGAGE_UNITS.oversized : 0)
  );
}

export function vehicleFitForLuggage(units: number): Record<VehicleClass, boolean> {
  return {
    sedan: VEHICLE_CAPACITY.sedan.max_luggage_units >= units,
    suv: VEHICLE_CAPACITY.suv.max_luggage_units >= units,
    minivan: VEHICLE_CAPACITY.minivan.max_luggage_units >= units,
    truck: VEHICLE_CAPACITY.truck.max_luggage_units >= units,
  };
}

// Smallest vehicle that fits the load; null if it exceeds every class.
export function recommendedVehicleClass(units: number): VehicleClass | null {
  for (const vehicleClass of VEHICLE_CLASS_ORDER) {
    if (VEHICLE_CAPACITY[vehicleClass].max_luggage_units >= units) {
      return vehicleClass;
    }
  }
  return null;
}

export interface PriceBreakdown {
  baseFare: number;
  oversizedSurcharge: number;
  total: number;
}

// Amounts in cents, matching constants/index.ts PRICING.
export function calculatePrice(
  rideType: RideType,
  vehicleClass: VehicleClass,
  oversized: boolean
): PriceBreakdown {
  let baseFare: number;

  if (rideType === 'solo') {
    baseFare = PRICING.solo_flat;
  } else {
    switch (vehicleClass) {
      case 'sedan':
        baseFare = PRICING.shared_sedan_per_seat;
        break;
      case 'suv':
        baseFare = PRICING.shared_suv_per_seat;
        break;
      default:
        // Trucks have no shared per-seat rate (they're a solo/heavy-luggage
        // option) — fall back to the minivan rate as the closest shared class.
        baseFare = PRICING.shared_minivan_per_seat;
    }
  }

  const oversizedSurcharge = oversized ? PRICING.oversized_surcharge : 0;
  return { baseFare, oversizedSurcharge, total: baseFare + oversizedSurcharge };
}

// Cross-student matching has to run server-side (SECURITY DEFINER RPC) since
// RLS correctly hides other students' ride_passengers rows from the client —
// this just calls that RPC and returns a ride id or null.
export async function findCompatibleRide(
  flightLanding: Date,
  luggageUnits: number,
  rideType: RideType
): Promise<string | null> {
  if (rideType !== 'shared') return null;

  const departureDate = flightLanding.toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc('find_compatible_ride', {
    p_departure_date: departureDate,
    p_estimated_landing: flightLanding.toISOString(),
    p_luggage_units: luggageUnits,
  });

  if (error) throw error;
  return (data as string | null) ?? null;
}

// Mirrors calculate_driver_leave_time() in 001_initial_schema.sql — derived
// client-side from drive time minus the customs/arrivals buffer, so it
// stays correct if either TIMING constant changes rather than hardcoding.
export function calculateDriverLeaveTime(estimatedLanding: string | null | undefined): Date | null {
  if (!estimatedLanding) return null;
  const landing = new Date(estimatedLanding);
  if (!isValid(landing)) return null;
  const offsetMinutes = TIMING.brandon_to_winnipeg_minutes - TIMING.customs_buffer_minutes;
  return new Date(landing.getTime() - offsetMinutes * 60000);
}

export function calculateReturnToBrandon(estimatedLanding: string | null | undefined): Date | null {
  if (!estimatedLanding) return null;
  const landing = new Date(estimatedLanding);
  if (!isValid(landing)) return null;
  const totalMinutes = TIMING.customs_buffer_minutes + TIMING.brandon_to_winnipeg_minutes;
  return new Date(landing.getTime() + totalMinutes * 60000);
}

export function driverQualifiesForRide(
  driverProfile: DriverProfile,
  ride: Pick<Ride, 'filled_seats'>,
  combinedLuggageUnits: number
): boolean {
  return (
    driverProfile.max_passengers >= ride.filled_seats &&
    driverProfile.max_luggage_units >= combinedLuggageUnits
  );
}

export interface EarningsRange {
  low: number;
  high: number;
}

// Rough estimate only — no historical trip-volume data exists yet to base
// real averages on (see EARNINGS_PROJECTION in constants/index.ts).
export function projectMonthlyEarnings(availableDaysThisMonth: number): EarningsRange {
  return {
    low: Math.round(
      availableDaysThisMonth *
        EARNINGS_PROJECTION.avg_trips_per_available_day_low *
        EARNINGS_PROJECTION.avg_earnings_per_trip_low
    ),
    high: Math.round(
      availableDaysThisMonth *
        EARNINGS_PROJECTION.avg_trips_per_available_day_high *
        EARNINGS_PROJECTION.avg_earnings_per_trip_high
    ),
  };
}
