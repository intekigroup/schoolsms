export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'

/** Annual budgets per income/expense account. GET ?fiscalYear; PUT { fiscalYear, items: [{ accountId, amount }] } replaces the year. */
export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.accounting)
  if (!guard.ok) return guard.response
  const fiscalYear = Number(new URL(req.url).searchParams.get('fiscalYear') ?? new Date().getUTCFullYear())
  const budgets = await prisma.budget.findMany({ where: { schoolId: guard.schoolId, fiscalYear }, include: { account: { select: { code: true, name: true, type: true } } }, orderBy: { account: { code: 'asc' } } })
  return NextResponse.json({ fiscalYear, budgets })
}

export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.accounting, req)
  if (!guard.ok) return guard.response
  const parsed = z.object({ fiscalYear: z.number().int().min(2000).max(2100), items: z.array(z.object({ accountId: z.string().min(1), amount: z.number().int().min(0) })).max(200) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { fiscalYear, items } = parsed.data
  const ids = [...new Set(items.map((i) => i.accountId))]
  const owned = await prisma.ledgerAccount.count({ where: { id: { in: ids }, schoolId: guard.schoolId, type: { in: ['INCOME', 'EXPENSE'] } } })
  if (owned !== ids.length) return NextResponse.json({ error: 'Budgets apply to your own income and expense accounts only' }, { status: 400 })
  await prisma.$transaction([
    prisma.budget.deleteMany({ where: { schoolId: guard.schoolId, fiscalYear } }),
    ...(items.filter((i) => i.amount > 0).length ? [prisma.budget.createMany({ data: items.filter((i) => i.amount > 0).map((i) => ({ schoolId: guard.schoolId, fiscalYear, accountId: i.accountId, amount: i.amount })) })] : []),
  ])
  await record(guard.session, { action: 'update', entity: 'Budget', entityId: String(fiscalYear), summary: `Set FY ${fiscalYear} budget on ${items.filter((i) => i.amount > 0).length} account(s)` })
  return NextResponse.json({ success: true })
}
