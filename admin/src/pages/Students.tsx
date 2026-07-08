import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { StudentDetailDrawer } from '@/components/StudentDetailDrawer'
import { fetchAllRidePassengers, fetchStudents } from '@/lib/adminApi'
import { safeFormat } from '@/lib/format'

export default function Students() {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: fetchStudents })
  const passengersQuery = useQuery({ queryKey: ['all-ride-passengers'], queryFn: fetchAllRidePassengers })

  const rideCountByStudent = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of passengersQuery.data ?? []) {
      counts.set(p.student_id, (counts.get(p.student_id) ?? 0) + 1)
    }
    return counts
  }, [passengersQuery.data])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Students</h1>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">University</th>
              <th className="px-4 py-3">Rides</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {(studentsQuery.data ?? []).map((student) => (
              <tr
                key={student.id}
                onClick={() => setSelectedStudentId(student.id)}
                className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50"
              >
                <td className="px-4 py-3">{student.profile?.full_name}</td>
                <td className="px-4 py-3">{student.profile?.email}</td>
                <td className="px-4 py-3">{student.university}</td>
                <td className="px-4 py-3">{rideCountByStudent.get(student.id) ?? 0}</td>
                <td className="px-4 py-3">{student.profile?.is_verified ? 'Verified' : 'Pending'}</td>
                <td className="px-4 py-3">{safeFormat(student.created_at, 'MMM d, yyyy')}</td>
              </tr>
            ))}
            {(studentsQuery.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No students yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedStudentId ? <StudentDetailDrawer studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} /> : null}
    </div>
  )
}
