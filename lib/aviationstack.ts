const BASE_URL = process.env.EXPO_PUBLIC_AVIATIONSTACK_BASE_URL ?? 'http://api.aviationstack.com/v1';
const WINNIPEG_IATA = 'YWG';
const DELAYED_THRESHOLD_MINUTES = 10;

// Airline IATA codes are 2 alphanumeric characters, not always 2 letters
// (e.g. Flair is "F8", UPS is "5X", Cargojet is "W8").
export const FLIGHT_NUMBER_REGEX = /^[A-Za-z0-9]{2}\d{1,4}$/;

export type FlightLookupErrorCode =
  | 'invalid_format'
  | 'not_configured'
  | 'not_found'
  | 'no_data_for_date'
  | 'wrong_destination'
  | 'rate_limited'
  | 'network_error'
  | 'unknown';

// Thrown by validateFlight() — the booking flow needs a specific reason
// to show the right error card. checkFlightStatus() never throws this;
// it collapses every failure mode into a single 'unknown' result instead,
// since it runs unattended from a cron tick with no one to catch it.
export class FlightLookupError extends Error {
  code: FlightLookupErrorCode;

  constructor(code: FlightLookupErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'FlightLookupError';
  }
}

export type RawFlightState = 'scheduled' | 'active' | 'landed' | 'cancelled' | 'incident' | 'diverted';

export interface FlightInfo {
  flightNumber: string;
  airline: string;
  originCity: string;
  originCode: string;
  destinationCode: 'YWG';
  departureTime: Date;
  estimatedLanding: Date;
  status: RawFlightState;
}

export interface FlightStatus {
  status: 'on_time' | 'delayed' | 'cancelled' | 'landed' | 'unknown';
  estimatedLanding: Date | null;
  actualLanding: Date | null;
  delayMinutes: number;
}

interface AviationStackAirport {
  airport: string;
  iata: string;
  scheduled: string;
  estimated: string;
  actual: string | null;
}

interface AviationStackFlight {
  flight_date: string;
  flight_status: string;
  departure: AviationStackAirport;
  arrival: AviationStackAirport;
  airline: { name: string };
  flight: { iata: string };
}

interface AviationStackResponse {
  data?: AviationStackFlight[];
  error?: { code?: string; message?: string };
}

const RATE_LIMIT_CODES = new Set(['usage_limit_reached', 'rate_limit_reached', 'function_access_restricted']);

// Shared HTTP + validation logic for both public functions below. Always
// throws FlightLookupError on any failure — checkFlightStatus() catches
// and downgrades that to 'unknown' rather than letting it propagate,
// since it must never throw into an unattended cron tick.
async function fetchWinnipegFlight(flightNumber: string, date: string): Promise<AviationStackFlight> {
  const normalized = flightNumber.trim().toUpperCase();

  if (!FLIGHT_NUMBER_REGEX.test(normalized)) {
    throw new FlightLookupError(
      'invalid_format',
      'Flight number should start with a 2-character airline code followed by 1-4 numbers (e.g. AC855 or F8643).'
    );
  }

  const apiKey = process.env.EXPO_PUBLIC_AVIATIONSTACK_API_KEY;
  if (!apiKey) {
    throw new FlightLookupError('not_configured', 'Flight lookup is not configured yet.');
  }

  // flight_date as a query param is a paid-tier-only filter on
  // AviationStack's free plan — sending it returns a hard
  // function_access_restricted error (confirmed live). Fetch by
  // flight_iata alone and filter the results by date client-side below.
  const url = `${BASE_URL}/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(normalized)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new FlightLookupError('network_error', 'Could not reach the flight lookup service. Check your connection.');
  }

  let body: AviationStackResponse;
  try {
    body = await response.json();
  } catch {
    throw new FlightLookupError('network_error', 'Flight lookup returned an unexpected response.');
  }

  if (body.error) {
    if (body.error.code && RATE_LIMIT_CODES.has(body.error.code)) {
      throw new FlightLookupError('rate_limited', 'Flight lookup is temporarily unavailable. Please try again shortly.');
    }
    throw new FlightLookupError('unknown', body.error.message ?? 'Flight lookup failed.');
  }

  const results = body.data ?? [];
  if (results.length === 0) {
    throw new FlightLookupError('not_found', `We couldn't find flight ${normalized}. Double-check the number and try again.`);
  }

  const match = results.find((flight) => flight.flight_date === date);
  if (!match) {
    throw new FlightLookupError(
      'no_data_for_date',
      `Flight ${normalized} exists, but we don't have schedule data for ${date} yet. Try again closer to your travel date.`
    );
  }

  return match;
}

function normalizeState(status: string): RawFlightState {
  switch (status) {
    case 'scheduled':
    case 'active':
    case 'landed':
    case 'cancelled':
    case 'incident':
    case 'diverted':
      return status;
    default:
      return 'scheduled';
  }
}

// --- Call 1: booking time ---------------------------------------------
export async function validateFlight(flightNumber: string, date: string): Promise<FlightInfo> {
  const match = await fetchWinnipegFlight(flightNumber, date);

  if (match.arrival.iata !== WINNIPEG_IATA) {
    throw new FlightLookupError(
      'wrong_destination',
      "This flight doesn't arrive in Winnipeg. Please enter your final flight to Winnipeg (YWG)."
    );
  }

  return {
    flightNumber: match.flight.iata,
    airline: match.airline.name,
    originCity: match.departure.airport,
    originCode: match.departure.iata,
    destinationCode: 'YWG',
    departureTime: new Date(match.departure.estimated ?? match.departure.scheduled),
    estimatedLanding: new Date(match.arrival.estimated ?? match.arrival.scheduled),
    status: normalizeState(match.flight_status),
  };
}

// --- Call 2: departure time ---------------------------------------------
// Never throws — every failure mode (API down, rate limited, not found,
// wrong destination) collapses into a single 'unknown' result, since
// this runs from an unattended cron tick with no one to catch an error.
// 'unknown' is the caller's signal to alert the admin for a manual check.
export async function checkFlightStatus(flightNumber: string, date: string): Promise<FlightStatus> {
  try {
    const match = await fetchWinnipegFlight(flightNumber, date);

    if (match.flight_status === 'cancelled') {
      return { status: 'cancelled', estimatedLanding: null, actualLanding: null, delayMinutes: 0 };
    }

    const scheduledArrival = new Date(match.arrival.scheduled);
    const estimatedArrival = new Date(match.arrival.estimated ?? match.arrival.scheduled);
    const actualArrival = match.arrival.actual ? new Date(match.arrival.actual) : null;
    const delayMinutes = Math.max(
      0,
      Math.round(((actualArrival ?? estimatedArrival).getTime() - scheduledArrival.getTime()) / 60000)
    );

    if (match.flight_status === 'landed' || actualArrival) {
      return { status: 'landed', estimatedLanding: estimatedArrival, actualLanding: actualArrival, delayMinutes };
    }

    return {
      status: delayMinutes >= DELAYED_THRESHOLD_MINUTES ? 'delayed' : 'on_time',
      estimatedLanding: estimatedArrival,
      actualLanding: null,
      delayMinutes,
    };
  } catch {
    return { status: 'unknown', estimatedLanding: null, actualLanding: null, delayMinutes: 0 };
  }
}
