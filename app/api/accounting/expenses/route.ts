export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record, tzs } from '@/lib/audit'
import { LedgerError, recordExpense, voidEntry } from '@/lib/accounting/ledger'
import { pageParam, limitParam, pageArgs } from '@/lib/paging'

const Create = z.object({ date: z.string().date(), payee: z.string().trim().min(2).max(80), description: z.string().trim().min(2).max(200), amount: z.number().int().min(1).max(10_000_000_000), accountId: z.string().min(1), paidFromId: z.string().min(1), reference: z.string().trim().max(60).optional() })

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.accounting)
  if (!guard.ok) return guard.response
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from'), to = searchParams.get('to')
  const page = pageParam(searchParams), pageSize = limitParam(searchParams)
  const where = { schoolId: guard.schoolId, ...(from || to ? { date: { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}) } } : {}) }
  const [total, expenses] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where, orderBy: [{ date: 'desc' }, { number: 'desc' }], ...pageArgs(page, pageSize),
      include: { account: { select: { code: true, name: true } }, paidFromAcct: { select: { code: true, name: true } }, journalEntry: { select: { status: true, voidReason: true } } },
    }),
  ])
  return NextResponse.json({ expenses, page, pageSize, total })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.accounting, req)
  if (!guard.ok) return guard.response
  const parsed = Create.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` }, { status: 400 })
  try {
    const { expense } = await recordExpense(guard.schoolId, { ...parsed.data, date: new Date(`${parsed.data.date}T00:00:00Z`) }, guard.session.user.id)
    await record(guard.session, { action: 'create', entity: 'Expense', entityId: expense.id, summary: `Recorded expense ${expense.number}: ${tzs(expense.amount)} to ${expense.payee} — ${expense.description}` })
    return NextResponse.json({ expense })
  } catch (e: any) {
    if (e instanceof LedgerError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}

/** Voids the expense's journal entry; the expense row stays for the record. */
export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.accounting, req)
  if (!guard.ok) return guard.response
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') ?? '', reason = searchParams.get('reason') ?? 'Voided'
  const expense = await prisma.expense.findFirst({ where: { id, schoolId: guard.schoolId } })
  if (!expense || !expense.journalEntryId) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  try {
    await voidEntry(guard.schoolId, expense.journalEntryId, reason)
  } catch (e: any) {
    if (e instanceof LedgerError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
  await record(guard.session, { action: 'update', entity: 'Expense', entityId: id, summary: `Voided expense ${expense.number}: ${reason}` })
  return NextResponse.json({ success: true })
}
