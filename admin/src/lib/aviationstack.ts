// Lean lookup-only client for the admin panel — just "what's this flight's
// current status," not the full booking-validation flow the mobile app's
// lib/aviationstack.ts implements (format validation, YWG-destination
// enforcement, etc.). Same API, same key.
export interface LiveFlightStatus {
  status: string
  estimatedArrival: string | null
  actualArrival: string | null
}

export async function fetchLiveFlightStatus(flightNumber: string, date: string): Promise<LiveFlightStatus | null> {
  const apiKey = import.meta.env.VITE_AVIATIONSTACK_API_KEY
  if (!apiKey) return null

  try {
    const response = await fetch(
      `https://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(flightNumber)}`
    )
    const body = await response.json()
    const results: { flight_date: string; flight_status: string; arrival: { estimated: string; actual: string | null } }[] =
      body.data ?? []
    const match = results.find((f) => f.flight_date === date) ?? results[0]
    if (!match) return null

    return {
      status: match.flight_status,
      estimatedArrival: match.arrival.estimated,
      actualArrival: match.arrival.actual,
    }
  } catch {
    return null
  }
}
