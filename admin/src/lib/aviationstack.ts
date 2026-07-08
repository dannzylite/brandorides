const BASE_URL = 'http://api.aviationstack.com/v1'
const WINNIPEG_IATA = 'YWG'

export interface FlightValidationResult {
  found: boolean
  isWinnipegBound: boolean
  airline: string | null
  originCity: string | null
  originCode: string | null
  departureTime: string | null // ISO
  estimatedLanding: string | null // ISO
  flightStatus: string | null
  error: string | null
}

const EMPTY_RESULT: Omit<FlightValidationResult, 'error'> = {
  found: false,
  isWinnipegBound: false,
  airline: null,
  originCity: null,
  originCode: null,
  departureTime: null,
  estimatedLanding: null,
  flightStatus: null,
}

// The admin's on-demand equivalent of the mobile app's validateFlight() —
// used only when an admin explicitly clicks "Check Flight" while
// reviewing a missed-connection report, never automatically. flight_date
// is a paid-tier-only AviationStack filter (confirmed live elsewhere in
// this project) — fetch by flight_iata alone and filter client-side.
export async function checkFlightForAdmin(flightNumber: string, date: string): Promise<FlightValidationResult> {
  const apiKey = import.meta.env.VITE_AVIATIONSTACK_API_KEY as string | undefined
  if (!apiKey) {
    return { ...EMPTY_RESULT, error: 'Flight lookup is not configured.' }
  }

  const url = `${BASE_URL}/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(flightNumber.trim().toUpperCase())}`

  try {
    const res = await fetch(url)
    const body = await res.json()

    if (body.error) {
      return { ...EMPTY_RESULT, error: body.error.message ?? 'Flight lookup failed.' }
    }

    const results = (body.data ?? []) as Array<{
      flight_date: string
      flight_status: string
      departure: { airport: string; iata: string; scheduled: string; estimated: string }
      arrival: { iata: string; scheduled: string; estimated: string }
      airline: { name: string }
    }>

    const match = results.find((f) => f.flight_date === date)
    if (!match) {
      return { ...EMPTY_RESULT, error: `No schedule data for this flight on ${date}.` }
    }

    return {
      found: true,
      isWinnipegBound: match.arrival.iata === WINNIPEG_IATA,
      airline: match.airline.name,
      originCity: match.departure.airport,
      originCode: match.departure.iata,
      departureTime: match.departure.estimated ?? match.departure.scheduled,
      estimatedLanding: match.arrival.estimated ?? match.arrival.scheduled,
      flightStatus: match.flight_status,
      error: null,
    }
  } catch {
    return { ...EMPTY_RESULT, error: 'Could not reach the flight lookup service.' }
  }
}
