export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { recordInvoicePayment, tzs } from '@/lib/billing'

/** Records a payment against a subscription invoice. Platform only. */
const Schema = z.object({
  invoiceId: z.string({ required_error: 'Choose an invoice' }).min(1),
  amount: z.number({ required_error: 'Enter the amount received' }).int('Amounts are whole shillings').positive(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'MPESA', 'TIGOPESA', 'AIRTEL_MONEY', 'CHEQUE', 'CARD']).optional(),
  reference: z.string().trim().max(120).optional(),
})

export async function POST(req: Request) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const parsed = Schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  try {
    const result = await recordInvoicePayment({
      invoiceId: parsed.data.invoiceId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      reference: parsed.data.reference ?? null,
      recordedBy: guard.session.user.id,
    })
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: /not found/i.test(result.error) ? 404 : 409 })
    }

    const school = await prisma.school.findUnique({ where: { id: result.invoice.schoolId }, select: { name: true } })
    await record(guard.session, {
      action: 'create',
      entity: 'InvoicePayment',
      entityId: result.payment.id,
      summary:
        `Received ${tzs(result.payment.amount)} against ${result.invoice.number} (${school?.name})` +
        (result.reactivated ? ' — subscription reactivated' : ''),
    })

    return NextResponse.json({
      ok: true,
      status: result.invoice.status,
      reactivated: result.reactivated,
      payment: { id: result.payment.id, amount: result.payment.amount },
    })
  } catch (e: any) {
    console.error('invoice payment failed:', e)
    return NextResponse.json({ error: 'Could not record the payment' }, { status: 500 })
  }
}
