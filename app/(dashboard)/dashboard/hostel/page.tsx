import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { HostelClient } from './hostel-client'

export const dynamic = 'force-dynamic'

export default async function HostelPage() {
  const session = await requirePageRole(ROLES.hostel)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const dorms = await prisma.dormitory.findMany({
    where: { schoolId },
    include: {
      rooms: {
        include: {
          assignments: { include: { student: true } },
          _count: { select: { assignments: true } },
        },
      },
    },
  })
  const students = await prisma.student.findMany({
    where: { schoolId, status: 'ACTIVE' },
    include: { roomAssignment: true },
    orderBy: { firstName: 'asc' },
  })

  return <HostelClient
    dormitories={dorms.map((d: any) => ({
      id: d.id, name: d.name, gender: d.gender, capacity: d.capacity,
      rooms: (d.rooms ?? []).map((r: any) => ({
        id: r.id, roomNumber: r.roomNumber, capacity: r.capacity, occupied: r._count?.assignments ?? 0,
        occupants: (r.assignments ?? []).map((a: any) => ({
          id: a.student?.id, name: `${a.student?.firstName ?? ''} ${a.student?.lastName ?? ''}`.trim(),
        })).filter((o: any) => o.id),
      })),
    }))}
    students={students.map((s: any) => ({
      id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo,
      gender: s.gender, assigned: !!s.roomAssignment,
    }))}
  />
}
