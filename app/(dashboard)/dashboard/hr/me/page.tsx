import { requirePageRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { t as tr, type Locale } from '@/lib/i18n'
import { loadHrConfig } from '@/lib/hr/settings'
import { leaveBalances } from '@/lib/hr/leave'
import { periodLabel } from '@/lib/hr/payroll'
import { MyHrClient } from './my-hr-client'

export const dynamic = 'force-dynamic'

/** A staff member's own HR page: leave requests and balances, approved payslips. */
export default async function MyHrPage() {
  const session = await requirePageRole(ROLES.hrSelf)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">{tr('common.noSchool', session.user.locale as Locale)}</p>
  const staff = await prisma.staff.findFirst({ where: { userId: session.user.id, schoolId }, select: { id: true, firstName: true, lastName: true, employeeNo: true, role: true, employmentType: true, hireDate: true, contractEnd: true, department: true } })
  if (!staff) {
    return (
      <div className="p-8 text-muted-foreground">
        <p className="font-medium text-foreground">No staff record is linked to your login.</p>
        <p className="mt-1 text-sm">Ask the school office to link your account under Teachers &amp; Staff.</p>
      </div>
    )
  }
  const year = new Date().getUTCFullYear()
  const config = await loadHrConfig(schoolId)
  const [balances, payslips] = await Promise.all([
    leaveBalances(staff.id, year, config),
    prisma.payslip.findMany({ where: { staffId: staff.id, run: { status: { in: ['APPROVED', 'PAID'] } } }, orderBy: { run: { period: 'desc' } }, take: 24, select: { id: true, number: true, net: true, gross: true, paye: true, nssfEmployee: true, run: { select: { id: true, period: true, status: true, paidAt: true } } } }),
  ])
  return (
    <MyHrClient
      me={{ ...staff, hireDate: staff.hireDate?.toISOString() ?? null, contractEnd: staff.contractEnd?.toISOString() ?? null }}
      leaveTypes={config.leaveTypes}
      balances={balances}
      year={year}
      payslips={payslips.map((p) => ({ id: p.id, number: p.number, net: p.net, gross: p.gross, paye: p.paye, nssf: p.nssfEmployee, runId: p.run.id, period: periodLabel(p.run.period), status: p.run.status }))}
    />
  )
}
