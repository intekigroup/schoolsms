export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { LedgerError, postEntry, voidEntry } from '@/lib/accounting/ledger'
import { pageParam, limitParam, pageArgs } from '@/lib/paging'

/**
 * Journal. GET ?from&to&source&accountId&page&limit lists a page of entries with lines;
 * POST a manual entry; PATCH { id, action: 'void', reason }.
 */
const Line = z.object({ accountId: z.string().min(1), debit: z.number().int().min(0).optional(), credit: z.number().int().min(0).optional(), description: z.string().trim().max(120).optional() })
const Create = z.object({ date: z.string().date(), memo: z.string().trim().min(3).max(200), reference: z.string().trim().max(60).optional(), lines: z.array(Line).min(2).max(40) })

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.accounting)
  if (!guard.ok) return guard.response
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from'), to = searchParams.get('to'), source = searchParams.get('source'), accountId = searchParams.get('accountId')
  const page = pageParam(searchParams), size = limitParam(searchParams)
  const where = {
    schoolId: guard.schoolId,
    ...(from || to ? { date: { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}) } } : {}),
    ...(source ? { source: source as any } : {}),
    ...(accountId ? { lines: { some: { accountId } } } : {}),
  }
  const [total, entries] = await Promise.all([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({ where, orderBy: [{ date: 'desc' }, { number: 'desc' }], ...pageArgs(page, size), include: { lines: { include: { account: { select: { code: true, name: true } } } } } }),
  ])
  // `size` is the original name; `pageSize` matches the other paged lists.
  return NextResponse.json({ total, page, size, pageSize: size, entries })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.accounting, req)
  if (!guard.ok) return guard.response
  const parsed = Create.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` }, { status: 400 })
  try {
    const entry = await postEntry(guard.schoolId, { date: new Date(`${parsed.data.date}T00:00:00Z`), memo: parsed.data.memo, reference: parsed.data.reference, source: 'MANUAL', lines: parsed.data.lines }, guard.session.user.id)
    await record(guard.session, { action: 'create', entity: 'JournalEntry', entityId: entry.id, summary: `Posted ${entry.number}: ${entry.memo}` })
    return NextResponse.json({ entry })
  } catch (e: any) {
    if (e instanceof LedgerError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.accounting, req)
  if (!guard.ok) return guard.response
  const parsed = z.object({ id: z.string().min(1), action: z.literal('void'), reason: z.string().trim().min(3).max(200) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  try {
    const entry = await voidEntry(guard.schoolId, parsed.data.id, parsed.data.reason)
    await record(guard.session, { action: 'update', entity: 'JournalEntry', entityId: entry.id, summary: `Voided ${entry.number}: ${parsed.data.reason}` })
    return NextResponse.json({ entry })
  } catch (e: any) {
    if (e instanceof LedgerError) return NextResponse.json({ error: e.message }, { status: e.message.includes('not found') ? 404 : 400 })
    throw e
  }
}
