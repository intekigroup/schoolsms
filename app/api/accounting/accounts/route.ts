export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { ensureChart } from '@/lib/accounting/settings'

/** Chart of accounts. GET lists (seeding the default chart on first use); POST adds; PATCH renames/closes. */
const Create = z.object({ code: z.string().regex(/^\d{3,6}$/, 'Code must be 3–6 digits'), name: z.string().trim().min(2).max(60), type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']), subtype: z.string().trim().max(30).optional() })
const Update = z.object({ id: z.string().min(1), name: z.string().trim().min(2).max(60).optional(), subtype: z.string().trim().max(30).nullable().optional(), active: z.boolean().optional() })

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.accounting)
  if (!guard.ok) return guard.response
  await ensureChart(guard.schoolId)
  const withBalances = new URL(req.url).searchParams.get('balances') === '1'
  const accounts = await prisma.ledgerAccount.findMany({ where: { schoolId: guard.schoolId }, orderBy: { code: 'asc' } })
  if (!withBalances) return NextResponse.json({ accounts })
  const sums = await prisma.journalLine.groupBy({ by: ['accountId'], where: { account: { schoolId: guard.schoolId }, entry: { status: 'POSTED' } }, _sum: { debit: true, credit: true } })
  const m = new Map(sums.map((s) => [s.accountId, s._sum]))
  return NextResponse.json({
    accounts: accounts.map((a) => {
      const s = m.get(a.id); const dr = s?.debit ?? 0, cr = s?.credit ?? 0
      return { ...a, balance: a.type === 'ASSET' || a.type === 'EXPENSE' ? dr - cr : cr - dr }
    }),
  })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.accounting, req)
  if (!guard.ok) return guard.response
  const parsed = Create.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  await ensureChart(guard.schoolId)
  const dup = await prisma.ledgerAccount.findUnique({ where: { schoolId_code: { schoolId: guard.schoolId, code: parsed.data.code } } })
  if (dup) return NextResponse.json({ error: `Code ${parsed.data.code} is already used by ${dup.name}` }, { status: 409 })
  const account = await prisma.ledgerAccount.create({ data: { schoolId: guard.schoolId, ...parsed.data, subtype: parsed.data.subtype || null } })
  await record(guard.session, { action: 'create', entity: 'LedgerAccount', entityId: account.id, summary: `Added account ${account.code} ${account.name}` })
  return NextResponse.json({ account })
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.accounting, req)
  if (!guard.ok) return guard.response
  const parsed = Update.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { id, ...data } = parsed.data
  const existing = await prisma.ledgerAccount.findFirst({ where: { id, schoolId: guard.schoolId } })
  if (!existing) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  if (data.active === false && existing.isSystem) return NextResponse.json({ error: 'System accounts cannot be closed; rename it instead' }, { status: 400 })
  const account = await prisma.ledgerAccount.update({ where: { id }, data })
  await record(guard.session, { action: 'update', entity: 'LedgerAccount', entityId: id, summary: `Updated account ${account.code} ${account.name}` })
  return NextResponse.json({ account })
}
