import { useQuery } from '@tanstack/react-query'
import { fetchRidePassengersByStudent, fetchRidesByIds, fetchStudents } from '@/lib/adminApi'
import { formatCurrency, safeFormat } from '@/lib/format'

export function StudentDetailDrawer({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: fetchStudents })
  const passengersQuery = useQuery({
    queryKey: ['student-passengers', studentId],
    queryFn: () => fetchRidePassengersByStudent(studentId),
  })
  const rideIds = (passengersQuery.data ?? []).map((p) => p.ride_id)
  const ridesQuery = useQuery({ queryKey: ['student-rides', studentId, rideIds], queryFn: () => fetchRidesByIds(rideIds) })

  const student = (studentsQuery.data ?? []).find((s) => s.id === studentId)
  const rideById = new Map((ridesQuery.data ?? []).map((r) => [r.id, r]))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {!student ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{student.profile?.full_name}</h2>
                <p className="text-sm text-gray-500">{student.profile?.email}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <Section title="Profile">
              <Row label="University" value={student.university} />
              <Row label="Phone" value={student.profile?.phone ?? '—'} />
              <Row label="Joined" value={safeFormat(student.created_at, 'MMM d, yyyy')} />
            </Section>

            <Section title="Document Verification">
              <Row label="Verified" value={student.profile?.is_verified ? 'Yes' : 'Pending Review'} />
              <Row label="Student ID" value={student.student_id_url ? 'Uploaded' : 'Not uploaded'} />
              <Row label="Acceptance Letter" value={student.acceptance_letter_url ? 'Uploaded' : 'Not uploaded'} />
            </Section>

            <Section title="Ride History">
              {(passengersQuery.data ?? []).map((p) => {
                const ride = rideById.get(p.ride_id)
                return (
                  <div key={p.id} className="flex justify-between border-b border-gray-50 py-2 text-sm last:border-0">
                    <span className="text-gray-900">{ride ? `${ride.flight_number} · ${safeFormat(ride.departure_date, 'MMM d, yyyy')}` : p.ride_id}</span>
                    <span className="text-gray-500">{ride?.status ?? '—'}</span>
                  </div>
                )
              })}
              {(passengersQuery.data ?? []).length === 0 ? <p className="text-sm text-gray-400">No rides yet.</p> : null}
            </Section>

            <Section title="Payment History">
              {(passengersQuery.data ?? []).map((p) => (
                <div key={p.id} className="flex justify-between border-b border-gray-50 py-2 text-sm last:border-0">
                  <span className="text-gray-900">{formatCurrency(p.seat_fare + p.wait_fee_charged)}</span>
                  <span className="text-gray-500">{p.payment_status}</span>
                </div>
              ))}
              {(passengersQuery.data ?? []).length === 0 ? <p className="text-sm text-gray-400">No payments yet.</p> : null}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="rounded-xl bg-gray-50 p-4">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  )
}
