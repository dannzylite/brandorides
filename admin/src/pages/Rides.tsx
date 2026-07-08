import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { RideDetailDrawer } from '@/components/RideDetailDrawer'
import { RideStatusBadge } from '@/components/StatusBadge'
import { fetchAllDrivers, fetchRides } from '@/lib/adminApi'
import { formatCurrency, safeFormat } from '@/lib/format'

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'completed'

export default function Rides() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedRideId = searchParams.get('rideId')

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [search, setSearch] = useState('')

  const ridesQuery = useQuery({ queryKey: ['rides'], queryFn: fetchRides })
  const driversQuery = useQuery({ queryKey: ['drivers'], queryFn: fetchAllDrivers })

  const driverNameById = useMemo(
    () => new Map((driversQuery.data ?? []).map((d) => [d.id, d.profile?.full_name ?? 'Unknown'])),
    [driversQuery.data]
  )

  const filteredRides = useMemo(() => {
    return (ridesQuery.data ?? []).filter((ride) => {
      if (statusFilter === 'pending' && ride.status !== 'pending_driver') return false
      if (statusFilter === 'confirmed' && !['confirmed', 'driver_en_route', 'at_airport', 'in_progress'].includes(ride.status)) return false
      if (statusFilter === 'completed' && ride.status !== 'completed') return false
      if (startDate && ride.departure_date < startDate) return false
      if (endDate && ride.departure_date > endDate) return false
      if (search && !ride.flight_number.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [ridesQuery.data, statusFilter, startDate, endDate, search])

  const openRide = (id: string) => setSearchParams({ rideId: id })
  const closeDrawer = () => setSearchParams({})

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Rides</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Flight Number</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. AC855"
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Flight</th>
              <th className="px-4 py-3">Students</th>
              <th className="px-4 py-3">Driver</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Fare</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRides.map((ride) => (
              <tr key={ride.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="cursor-pointer px-4 py-3" onClick={() => openRide(ride.id)}>
                  {safeFormat(ride.departure_date, 'MMM d, yyyy')}
                </td>
                <td className="cursor-pointer px-4 py-3" onClick={() => openRide(ride.id)}>
                  {ride.flight_number}
                </td>
                <td className="cursor-pointer px-4 py-3" onClick={() => openRide(ride.id)}>
                  {ride.filled_seats}
                </td>
                <td className="cursor-pointer px-4 py-3" onClick={() => openRide(ride.id)}>
                  {ride.driver_id ? driverNameById.get(ride.driver_id) ?? '—' : '—'}
                </td>
                <td className="cursor-pointer px-4 py-3" onClick={() => openRide(ride.id)}>
                  <RideStatusBadge status={ride.status} />
                </td>
                <td className="cursor-pointer px-4 py-3" onClick={() => openRide(ride.id)}>
                  {formatCurrency(ride.base_fare_per_seat)}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openRide(ride.id)} className="text-sm font-medium text-primary hover:underline">
                    View
                  </button>
                </td>
              </tr>
            ))}
            {filteredRides.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  No rides match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedRideId ? <RideDetailDrawer rideId={selectedRideId} onClose={closeDrawer} /> : null}
    </div>
  )
}
