import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DocumentModal } from '@/components/DocumentModal'
import { DriverDetailDrawer } from '@/components/DriverDetailDrawer'
import { approveDriver, fetchAllDrivers, rejectDriver } from '@/lib/adminApi'
import { safeFormat } from '@/lib/format'

type Tab = 'pending' | 'approved'

export default function Drivers() {
  const [tab, setTab] = useState<Tab>('pending')
  const [documentDriverId, setDocumentDriverId] = useState<string | null>(null)
  const [rejectingDriverId, setRejectingDriverId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const driversQuery = useQuery({ queryKey: ['drivers'], queryFn: fetchAllDrivers })
  const drivers = driversQuery.data ?? []
  const pendingDrivers = drivers.filter((d) => !d.is_approved)
  const approvedDrivers = drivers.filter((d) => d.is_approved)

  const approveMutation = useMutation({
    mutationFn: approveDriver,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drivers'] }),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ driverId, reason }: { driverId: string; reason: string }) => rejectDriver(driverId, reason),
    onSuccess: () => {
      setRejectingDriverId(null)
      setRejectReason('')
    },
  })

  const documentDriver = drivers.find((d) => d.id === documentDriverId)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>

      <div className="flex gap-2 border-b border-gray-200">
        <TabButton active={tab === 'pending'} onClick={() => setTab('pending')}>
          Pending Approval {pendingDrivers.length > 0 ? `(${pendingDrivers.length})` : ''}
        </TabButton>
        <TabButton active={tab === 'approved'} onClick={() => setTab('approved')}>
          Approved Drivers
        </TabButton>
      </div>

      {tab === 'pending' ? (
        <div className="space-y-4">
          {pendingDrivers.map((driver) => (
            <div key={driver.id} className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{driver.profile?.full_name}</p>
                  <p className="text-sm text-gray-500">
                    {driver.vehicle_color} {driver.vehicle_year} {driver.vehicle_make} {driver.vehicle_model} ·{' '}
                    {driver.vehicle_plate}
                  </p>
                  <p className="text-xs text-gray-400">Registered {safeFormat(driver.created_at, 'MMM d, yyyy')}</p>
                </div>
                <button
                  onClick={() => setDocumentDriverId(driver.id)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Review Documents
                </button>
              </div>

              {rejectingDriverId === driver.id ? (
                <div className="mt-4 space-y-2 rounded-lg bg-red-50 p-3">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection..."
                    className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm focus:outline-none"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => rejectMutation.mutate({ driverId: driver.id, reason: rejectReason })}
                      disabled={!rejectReason.trim() || rejectMutation.isPending}
                      className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Confirm Reject
                    </button>
                    <button
                      onClick={() => setRejectingDriverId(null)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => approveMutation.mutate(driver.id)}
                    disabled={approveMutation.isPending}
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    APPROVE
                  </button>
                  <button
                    onClick={() => setRejectingDriverId(driver.id)}
                    className="rounded-lg bg-danger px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                  >
                    REJECT
                  </button>
                </div>
              )}
            </div>
          ))}
          {pendingDrivers.length === 0 ? <p className="rounded-xl bg-white p-6 text-center text-gray-400 shadow-sm">No drivers awaiting approval.</p> : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Trips</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {approvedDrivers.map((driver) => (
                <tr key={driver.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">{driver.profile?.full_name}</td>
                  <td className="px-4 py-3">
                    {driver.vehicle_make} {driver.vehicle_model} ({driver.vehicle_class})
                  </td>
                  <td className="px-4 py-3">{driver.rating.toFixed(1)} ★</td>
                  <td className="px-4 py-3">{driver.total_trips}</td>
                  <td className="px-4 py-3 text-emerald-600">Approved</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedDriverId(driver.id)} className="font-medium text-primary hover:underline">
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {approvedDrivers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    No approved drivers yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {documentDriver ? (
        <DocumentModal
          title={documentDriver.profile?.full_name ?? 'Driver'}
          licensePath={documentDriver.license_url}
          insurancePath={documentDriver.insurance_url}
          onClose={() => setDocumentDriverId(null)}
        />
      ) : null}

      {selectedDriverId ? <DriverDetailDrawer driverId={selectedDriverId} onClose={() => setSelectedDriverId(null)} /> : null}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold ${
        active ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}
