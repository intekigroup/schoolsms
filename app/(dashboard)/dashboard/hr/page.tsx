import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { loadHrConfig } from '@/lib/hr/settings'
import { HrClient } from './hr-client'

export const dynamic = 'force-dynamic'

/** HR & Payroll: staff records, attendance, leave, payroll runs. */
export default async function HrPage() {
  const session = await requirePageRole(ROLES.hr)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>

  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const in60 = new Date(today.getTime() + 60 * 86400000)
  const [config, headcount, onLeave, pendingLeave, contractsEnding, lastRun] = await Promise.all([
    loadHrConfig(schoolId),
    prisma.staff.count({ where: { schoolId, status: { in: ['ACTIVE', 'ON_LEAVE'] } } }),
    prisma.leaveRequest.count({ where: { staff: { schoolId }, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } } }),
    prisma.leaveRequest.count({ where: { staff: { schoolId }, status: 'PENDING' } }),
    prisma.staff.findMany({ where: { schoolId, status: { in: ['ACTIVE', 'ON_LEAVE'] }, contractEnd: { gte: today, lte: in60 } }, orderBy: { contractEnd: 'asc' }, select: { id: true, firstName: true, lastName: true, contractEnd: true } }),
    prisma.payrollRun.findFirst({ where: { schoolId }, orderBy: { period: 'desc' } }),
  ])

  return (
    <HrClient
      config={config}
      overview={{
        headcount, onLeave, pendingLeave,
        contractsEnding: contractsEnding.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, contractEnd: s.contractEnd!.toISOString().slice(0, 10) })),
        lastRun: lastRun ? { id: lastRun.id, period: lastRun.period, status: lastRun.status, totalNet: lastRun.totalNet } : null,
      }}
    />
  )
}
