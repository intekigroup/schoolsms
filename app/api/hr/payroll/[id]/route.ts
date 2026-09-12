export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { attachment, SCHOOL_HEADER_SELECT } from '@/lib/pdf'
import { loadHrConfig } from '@/lib/hr/settings'
import { periodLabel } from '@/lib/hr/payroll'
import { bankCsv, renderPayslips, renderRegister } from '@/lib/hr/pdf'

/**
 * One payroll run.
 *   GET                         JSON with every payslip (admin)
 *   GET ?format=payslips        every payslip as one PDF (admin)
 *   GET ?format=payslip&staffId all of one person's (admin), or the caller's own (any staff)
 *   GET ?format=register        payroll register PDF (admin)
 *   GET ?format=bank            bank instruction CSV (admin)
 *
 * The own-payslip case is why this checks the session itself rather than using
 * requireApiRole: a teacher may download their own slip and nobody else's.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const schoolId = session.user.schoolId
  if (!schoolId) return NextResponse.json({ error: 'No school' }, { status: 400 })
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format')
  const isAdmin = session.user.role === 'SCHOOL_ADMIN'

  const run = await prisma.payrollRun.findFirst({ where: { id, schoolId } })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

  // Non-admins: only their own payslip, only once approved.
  let staffFilter: string | null = isAdmin ? searchParams.get('staffId') : null
  if (!isAdmin) {
    const own = await prisma.staff.findFirst({ where: { userId: session.user.id, schoolId }, select: { id: true } })
    if (!own || format !== 'payslip') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (run.status === 'DRAFT') return NextResponse.json({ error: 'This payroll has not been approved yet' }, { status: 403 })
    staffFilter = own.id
  }

  const slips = await prisma.payslip.findMany({ where: { runId: id, ...(staffFilter ? { staffId: staffFilter } : {}) }, orderBy: { staffName: 'asc' } })
  if (!format) return NextResponse.json({ run: { ...run, label: periodLabel(run.period) }, payslips: slips })
  if (slips.length === 0) return NextResponse.json({ error: 'No payslips matched' }, { status: 404 })

  const limited = rateLimit(req, 'report', session.user.id)
  if (limited) return limited
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: SCHOOL_HEADER_SELECT })
  const config = await loadHrConfig(schoolId)
  const label = run.period

  if (format === 'bank') {
    await record(session, { action: 'export', entity: 'PayrollRun', entityId: id, summary: `Exported bank file for ${periodLabel(run.period)}` })
    return new NextResponse(bankCsv(run, slips), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': attachment(`bank-${label}.csv`), 'Cache-Control': 'no-store' } })
  }
  let bytes: Uint8Array, name: string
  if (format === 'register') { bytes = await renderRegister(run, slips, school!); name = `payroll-register-${label}.pdf` }
  else if (format === 'payslips' || format === 'payslip') {
    bytes = await renderPayslips(run, slips, school!, config.payroll.payslipNote, config.payroll.payDay)
    name = slips.length === 1 ? `payslip-${slips[0].employeeNo}-${label}.pdf` : `payslips-${label}.pdf`
  } else return NextResponse.json({ error: 'format must be payslips, payslip, register or bank' }, { status: 400 })
  await record(session, { action: 'export', entity: 'PayrollRun', entityId: id, summary: `Generated ${format} for ${periodLabel(run.period)}${staffFilter ? ' (one staff member)' : ''}` })
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': attachment(name), 'Cache-Control': 'no-store' } })
}
