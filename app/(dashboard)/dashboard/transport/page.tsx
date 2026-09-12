import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { TransportClient } from './transport-client'

export const dynamic = 'force-dynamic'

export default async function TransportPage() {
  const session = await requirePageRole(ROLES.transport)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const routes = await prisma.transportRoute.findMany({
    where: { schoolId },
    include: {
      _count: { select: { students: true } },
      vehicles: { include: { vehicle: true } },
      students: { include: { student: true } },
    },
  })
  const vehicles = await prisma.vehicle.findMany({ where: { schoolId } })
  const students = await prisma.student.findMany({
    where: { schoolId, status: 'ACTIVE' },
    include: { studentRoute: true },
    orderBy: { firstName: 'asc' },
  })

  return <TransportClient
    routes={routes.map((r: any) => ({
      id: r.id, name: r.name, stops: r.stops ?? '', fee: r.fee,
      studentCount: r._count?.students ?? 0,
      vehicles: (r.vehicles ?? []).map((vr: any) => vr.vehicle?.plateNumber).filter(Boolean),
      students: (r.students ?? []).map((sr: any) => ({
        id: sr.student?.id, name: `${sr.student?.firstName ?? ''} ${sr.student?.lastName ?? ''}`.trim(),
      })).filter((s: any) => s.id),
    }))}
    vehicles={vehicles.map((v: any) => ({ id: v.id, plateNumber: v.plateNumber, capacity: v.capacity, driverName: v.driverName ?? '' }))}
    students={students.map((s: any) => ({
      id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo,
      assigned: !!s.studentRoute,
    }))}
  />
}
