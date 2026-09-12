import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { ReportsClient } from './reports-client'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const session = await requirePageRole(ROLES.reports)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const [studentCount, staffCount, classCount, feesTotal, attendanceRate] = await Promise.all([
    prisma.student.count({ where: { schoolId, status: 'ACTIVE' } }),
    prisma.staff.count({ where: { schoolId, status: 'ACTIVE' } }),
    prisma.class.count({ where: { schoolId } }),
    prisma.feePayment.aggregate({ where: { student: { schoolId }, paymentStatus: 'COMPLETED' }, _sum: { amount: true } }),
    prisma.attendance.count({ where: { class: { schoolId }, status: 'PRESENT' } }),
  ])

  return <ReportsClient stats={{
    studentCount, staffCount, classCount,
    feesTotal: feesTotal._sum?.amount ?? 0,
    attendancePresent: attendanceRate,
  }} />
}
