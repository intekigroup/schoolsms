export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { loadHrConfig } from '@/lib/hr/settings'
import { buildRun, PERIOD_RE, periodLabel } from '@/lib/hr/payroll'
import { postPayrollRun } from '@/lib/accounting/ledger'

/**
 * Payroll runs.
 *   GET                       list runs (newest first)
 *   POST { period }           create a draft for YYYY-MM and compute every payslip
 *   PATCH { id, action }      recompute (draft) · approve (draft→approved) · pay (approved→paid) · reopen (approved→draft)
 *   DELETE ?id                delete a draft
 */
export async function GET() {
  const guard = await requireApiRole(ROLES.hr)
  if (!guard.ok) return guard.response
  const runs = await prisma.payrollRun.findMany({ where: { schoolId: guard.schoolId }, orderBy: { period: 'desc' }, include: { _count: { select: { payslips: true } } } })
  return NextResponse.json({ runs: runs.map((r) => ({ ...r, label: periodLabel(r.period), staffCount: r._count.payslips })) })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.hr, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = z.object({ period: z.string().regex(PERIOD_RE, 'period must be YYYY-MM'), notes: z.string().trim().max(200).optional() }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { period, notes } = parsed.data
  const exists = await prisma.payrollRun.findUnique({ where: { schoolId_period: { schoolId, period } } })
  if (exists) return NextResponse.json({ error: `A payroll run for ${periodLabel(period)} already exists` }, { status: 409 })
  const config = await loadHrConfig(schoolId)
  const run = await prisma.payrollRun.create({ data: { schoolId, period, notes: notes || null, createdById: guard.session.user.id } })
  const { count } = await buildRun(run.id, schoolId, config)
  await record(guard.session, { action: 'create', entity: 'PayrollRun', entityId: run.id, summary: `Created payroll draft for ${periodLabel(period)} (${count} staff)` })
  return NextResponse.json({ run: await prisma.payrollRun.findUnique({ where: { id: run.id } }), count })
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.hr, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const parsed = z.object({ id: z.string().min(1), action: z.enum(['recompute', 'approve', 'pay', 'reopen']), notes: z.string().trim().max(200).optional() }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { id, action, notes } = parsed.data
  const run = await prisma.payrollRun.findFirst({ where: { id, schoolId } })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  const label = periodLabel(run.period)

  if (action === 'recompute') {
    if (run.status !== 'DRAFT') return NextResponse.json({ error: 'Only a draft can be recomputed' }, { status: 400 })
    const { count } = await buildRun(id, schoolId, await loadHrConfig(schoolId))
    await record(guard.session, { action: 'update', entity: 'PayrollRun', entityId: id, summary: `Recomputed payroll draft for ${label} (${count} staff)` })
  } else if (action === 'approve') {
    if (run.status !== 'DRAFT') return NextResponse.json({ error: 'Only a draft can be approved' }, { status: 400 })
    const count = await prisma.payslip.count({ where: { runId: id } })
    if (count === 0) return NextResponse.json({ error: 'There are no payslips on this run' }, { status: 400 })
    await prisma.payrollRun.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date(), notes: notes ?? run.notes } })
    await record(guard.session, { action: 'update', entity: 'PayrollRun', entityId: id, summary: `Approved payroll for ${label}: net TZS ${run.totalNet.toLocaleString('en-GB')} for ${count} staff` })
  } else if (action === 'pay') {
    if (run.status !== 'APPROVED') return NextResponse.json({ error: 'Approve the run before marking it paid' }, { status: 400 })
    await prisma.payrollRun.update({ where: { id }, data: { status: 'PAID', paidAt: new Date(), notes: notes ?? run.notes } })
    try { await postPayrollRun(schoolId, id, guard.session.user.id) } catch (e) { console.error('ledger posting failed for payroll', run.period, e) }
    await record(guard.session, { action: 'update', entity: 'PayrollRun', entityId: id, summary: `Marked payroll for ${label} as paid (TZS ${run.totalNet.toLocaleString('en-GB')})` })
  } else if (action === 'reopen') {
    if (run.status !== 'APPROVED') return NextResponse.json({ error: 'Only an approved, unpaid run can be reopened' }, { status: 400 })
    await prisma.payrollRun.update({ where: { id }, data: { status: 'DRAFT', approvedAt: null } })
    await record(guard.session, { action: 'update', entity: 'PayrollRun', entityId: id, summary: `Reopened payroll for ${label}` })
  }
  return NextResponse.json({ run: await prisma.payrollRun.findUnique({ where: { id } }) })
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.hr, req)
  if (!guard.ok) return guard.response
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const run = await prisma.payrollRun.findFirst({ where: { id, schoolId: guard.schoolId } })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (run.status !== 'DRAFT') return NextResponse.json({ error: 'Only a draft can be deleted' }, { status: 400 })
  await prisma.payrollRun.delete({ where: { id } })
  await record(guard.session, { action: 'delete', entity: 'PayrollRun', entityId: id, summary: `Deleted payroll draft for ${periodLabel(run.period)}` })
  return NextResponse.json({ success: true })
}
