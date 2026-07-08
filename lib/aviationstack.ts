const BASE_URL = 'https://api.aviationstack.com/v1/flights';
const WINNIPEG_IATA = 'YWG';

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

export class FlightLookupError extends Error {
  code: FlightLookupErrorCode;

  constructor(code: FlightLookupErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'FlightLookupError';
  }
}

export type FlightStatus = 'scheduled' | 'active' | 'landed' | 'cancelled' | 'incident' | 'diverted';

export interface FlightInfo {
  flight_number: string;
  airline: string;
  origin: { name: string; code: string };
  destination: { name: string; code: string };
  scheduled_departure: string;
  estimated_departure: string;
  scheduled_arrival: string;
  estimated_arrival: string;
  actual_arrival: string | null;
  status: FlightStatus;
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

export async function fetchFlightInfo(flightNumber: string, date: string): Promise<FlightInfo> {
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

  const url = `${BASE_URL}?access_key=${apiKey}&flight_iata=${encodeURIComponent(normalized)}`;

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

  if (match.arrival.iata !== WINNIPEG_IATA) {
    throw new FlightLookupError('wrong_destination', 'This app only supports Winnipeg arrivals.');
  }

  return {
    flight_number: match.flight.iata,
    airline: match.airline.name,
    origin: { name: match.departure.airport, code: match.departure.iata },
    // Destination is always Winnipeg here (guaranteed by the check above),
    // so use a clean display name rather than AviationStack's official
    // arrival airport string.
    destination: { name: 'Winnipeg', code: match.arrival.iata },
    scheduled_departure: match.departure.scheduled,
    estimated_departure: match.departure.estimated ?? match.departure.scheduled,
    scheduled_arrival: match.arrival.scheduled,
    estimated_arrival: match.arrival.estimated ?? match.arrival.scheduled,
    actual_arrival: match.arrival.actual,
    status: normalizeStatus(match.flight_status),
  };
}

function normalizeStatus(status: string): FlightStatus {
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
