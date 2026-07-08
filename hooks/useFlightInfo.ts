import { useQuery } from '@tanstack/react-query';
import { fetchFlightInfo } from '@/lib/aviationstack';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export function useFlightInfo(flightNumber: string, date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['flight', flightNumber.trim().toUpperCase(), date],
    queryFn: () => fetchFlightInfo(flightNumber, date),
    enabled: enabled && flightNumber.trim().length > 0 && date.length > 0,
    staleTime: FIFTEEN_MINUTES,
    gcTime: FIFTEEN_MINUTES,
    retry: false,
  });
}
