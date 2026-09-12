export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireSuperAdmin } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { issueInvoice, tzs } from '@/lib/billing'

/**
 * Invoices.
 *
 * A super admin sees and issues across the platform; a school admin sees only
 * their own school's bills — which is why this reads the session directly
 * rather than using a single role guard.
 */

const IssueSchema = z.object({
  schoolId: z.string({ required_error: 'Choose a school' }).min(1, 'Choose a school'),
  plan: z.enum(['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE']).optional(),
  notes: z.string().trim().max(300).optional(),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isPlatform = session.user.role === 'SUPER_ADMIN'
  const requested = new URL(req.url).searchParams.get('schoolId')

  // A school admin is pinned to their own school no matter what they ask for.
  const schoolId = isPlatform ? requested ?? undefined : session.user.schoolId ?? '__none__'
  if (!isPlatform && session.user.role !== 'SCHOOL_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const invoices = await prisma.invoice.findMany({
    where: schoolId ? { schoolId } : {},
    include: {
      payments: { orderBy: { receivedAt: 'asc' } },
      school: { select: { id: true, name: true } },
    },
    orderBy: { issuedAt: 'desc' },
    take: 200,
  })

  const shaped = invoices.map((i) => {
    const paid = i.payments.reduce((sum, p) => sum + p.amount, 0)
    return {
      id: i.id,
      number: i.number,
      schoolId: i.schoolId,
      schoolName: i.school.name,
      plan: i.plan,
      amount: i.amount,
      paid,
      outstanding: i.amount - paid,
      currency: i.currency,
      status: i.status,
      periodStart: i.periodStart.toISOString(),
      periodEnd: i.periodEnd.toISOString(),
      issuedAt: i.issuedAt.toISOString(),
      dueAt: i.dueAt.toISOString(),
      paidAt: i.paidAt?.toISOString() ?? null,
      notes: i.notes,
      payments: i.payments.map((p) => ({
        id: p.id, amount: p.amount, method: p.method,
        reference: p.reference, receivedAt: p.receivedAt.toISOString(),
      })),
    }
  })

  return NextResponse.json({
    invoices: shaped,
    totals: {
      billed: shaped.reduce((s, i) => s + i.amount, 0),
      collected: shaped.reduce((s, i) => s + i.paid, 0),
      outstanding: shaped.filter((i) => i.status !== 'VOID').reduce((s, i) => s + i.outstanding, 0),
      overdue: shaped.filter((i) => i.status === 'OVERDUE').length,
    },
  })
}

/** Issue an invoice for a school's next period. Platform only. */
export async function POST(req: Request) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const parsed = IssueSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { schoolId, plan, notes } = parsed.data

  try {
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } })
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

    const invoice = await issueInvoice({ schoolId, plan, notes })
    if (!invoice) {
      return NextResponse.json(
        { error: 'No monthly amount has been agreed for this school yet. Set it under Manage, then issue the invoice.' },
        { status: 400 }
      )
    }

    await record(guard.session, {
      action: 'create',
      entity: 'Invoice',
      entityId: invoice.id,
      summary: `Issued invoice ${invoice.number} to ${school.name} for ${tzs(invoice.amount)} (${invoice.plan})`,
    })

    return NextResponse.json({ ok: true, invoice: { id: invoice.id, number: invoice.number, amount: invoice.amount } })
  } catch (e: any) {
    console.error('invoice issue failed:', e)
    return NextResponse.json({ error: e?.message ?? 'Could not issue the invoice' }, { status: 500 })
  }
}

/** Void an invoice raised in error. Platform only. */
export async function DELETE(req: Request) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Invoice id is required' }, { status: 400 })

  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true, school: true } })
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (invoice.payments.length > 0) {
    return NextResponse.json(
      { error: 'This invoice has payments against it and cannot be voided. Raise a credit instead.' },
      { status: 409 }
    )
  }

  await prisma.invoice.update({ where: { id }, data: { status: 'VOID' } })
  await record(guard.session, {
    action: 'update',
    entity: 'Invoice',
    entityId: id,
    summary: `Voided invoice ${invoice.number} for ${invoice.school.name}`,
  })

  return NextResponse.json({ ok: true })
}
