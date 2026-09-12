import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isStandalone } from '@/lib/edition'

/**
 * Subscription billing.
 *
 * Enforcement already existed — a subscription that is not ACTIVE puts the
 * school in read-only — but nothing recorded what a school was charged, and
 * nothing ever expired on its own. This closes both: invoices are the record,
 * and `runBillingCycle` is the clock.
 *
 * Amounts are whole Tanzanian shillings. TZS has no practical subunit, so an
 * integer is exact and the ledger never inherits Float rounding.
 */

/**
 * There is no price list. A school's monthly amount is quoted from its pupil
 * numbers and level, agreed, and stored on its subscription
 * (`SchoolSubscription.monthlyAmount`). Until that is set, nothing is billed.
 */

/** What each plan allows. Enforced at student/staff creation and shown on /pricing. */
export const PLAN_LIMITS: Record<string, { maxStudents: number; maxStaff: number }> = {
  FREE: { maxStudents: 50, maxStaff: 10 },
  BASIC: { maxStudents: 300, maxStaff: 40 },
  PREMIUM: { maxStudents: 1000, maxStaff: 150 },
  ENTERPRISE: { maxStudents: 100000, maxStaff: 10000 },
}

/** Days a school has to pay before an invoice is considered overdue. */
export const PAYMENT_TERMS_DAYS = Number(process.env.BILLING_TERMS_DAYS ?? 14)

/** Billing period length in days. */
export const PERIOD_DAYS = Number(process.env.BILLING_PERIOD_DAYS ?? 30)

export const tzs = (amount: number) => `TZS ${Math.round(amount).toLocaleString('en-GB')}`

export function addDays(from: Date, days: number) {
  return new Date(from.getTime() + days * 86_400_000)
}

/**
 * Allocates the next invoice number. Same approach as fee receipts: read the
 * high-water mark, write, and retry on the unique constraint rather than
 * trusting a count taken a moment earlier.
 */
async function nextInvoiceNumber(year: number, attempt = 0): Promise<string> {
  const prefix = `INV-${year}-`
  const latest = await prisma.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  const seq = (latest ? parseInt(latest.number.slice(prefix.length), 10) || 0 : 0) + 1 + attempt
  return `${prefix}${String(seq).padStart(5, '0')}`
}

export interface IssueOptions {
  schoolId: string
  /** Defaults to the school's current plan. */
  plan?: string
  /** Defaults to the current subscription period end, or today. */
  periodStart?: Date
  notes?: string | null
}

/**
 * Issues one invoice for a school's next period and moves the subscription
 * window forward. Returns null for a FREE plan — there is nothing to bill.
 */
export async function issueInvoice(opts: IssueOptions) {
  const subscription = await prisma.schoolSubscription.findUnique({ where: { schoolId: opts.schoolId } })
  if (!subscription) throw new Error('This school has no subscription')

  const plan = opts.plan ?? subscription.plan
  // Nothing agreed yet, or a free school: nothing to bill.
  const amount = subscription.monthlyAmount ?? 0
  if (amount <= 0) return null

  const periodStart = opts.periodStart ?? (subscription.endDate && subscription.endDate > new Date()
    ? subscription.endDate
    : new Date())
  const periodEnd = addDays(periodStart, PERIOD_DAYS)

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const invoice = await prisma.invoice.create({
        data: {
          number: await nextInvoiceNumber(periodStart.getFullYear(), attempt),
          schoolId: opts.schoolId,
          plan: plan as any,
          periodStart,
          periodEnd,
          amount,
          dueAt: addDays(new Date(), PAYMENT_TERMS_DAYS),
          notes: opts.notes ?? null,
        },
      })
      // The subscription now runs to the end of the period just billed.
      await prisma.schoolSubscription.update({
        where: { schoolId: opts.schoolId },
        data: { endDate: periodEnd },
      })
      return invoice
    } catch (e) {
      const clash =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        String(e.meta?.target ?? '').includes('number')
      if (!clash) throw e
    }
  }
  throw new Error('Could not allocate an invoice number')
}

/**
 * Records a payment. When the invoice is settled in full it is marked PAID and
 * the school is restored to ACTIVE — paying is what turns the service back on.
 */
export async function recordInvoicePayment(params: {
  invoiceId: string
  amount: number
  method?: string
  reference?: string | null
  recordedBy?: string | null
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { payments: true },
  })
  if (!invoice) return { error: 'Invoice not found' as const }
  if (invoice.status === 'VOID') return { error: 'This invoice has been voided' as const }

  const alreadyPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
  const outstanding = invoice.amount - alreadyPaid
  if (outstanding <= 0) return { error: 'This invoice is already settled' as const }
  if (params.amount <= 0) return { error: 'Enter an amount greater than zero' as const }
  if (params.amount > outstanding) {
    return { error: `That is more than the ${tzs(outstanding)} outstanding on this invoice` as const }
  }

  const settled = params.amount === outstanding

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        amount: params.amount,
        method: (params.method ?? 'BANK_TRANSFER') as any,
        reference: params.reference ?? null,
        recordedBy: params.recordedBy ?? null,
      },
    })

    if (!settled) return { payment, invoice, reactivated: false }

    const paid = await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'PAID', paidAt: new Date() },
    })

    // Settling the bill restores service. Only lift a suspension the billing
    // cycle imposed — a subscription CANCELLED by hand stays cancelled.
    const sub = await tx.schoolSubscription.findUnique({ where: { schoolId: invoice.schoolId } })
    let reactivated = false
    if (sub && (sub.status === 'EXPIRED' || sub.status === 'SUSPENDED')) {
      await tx.schoolSubscription.update({
        where: { schoolId: invoice.schoolId },
        data: {
          status: 'ACTIVE',
          // Never leave a paid-up school with an end date in the past.
          endDate: sub.endDate && sub.endDate > new Date() ? sub.endDate : invoice.periodEnd,
        },
      })
      reactivated = true
    }
    return { payment, invoice: paid, reactivated }
  })

  return result
}

export interface CycleReport {
  markedOverdue: number
  expired: string[]
  issued: string[]
  ranAt: string
}

/**
 * The clock. Run daily:
 *   1. invoices past their due date become OVERDUE,
 *   2. subscriptions whose period has ended become EXPIRED (which the access
 *      guard already turns into read-only),
 *   3. active schools nearing period end are invoiced for the next one.
 *
 * Idempotent: running it twice in a day issues nothing extra, because an
 * unpaid invoice for the upcoming period already exists.
 */
export async function runBillingCycle(now = new Date()): Promise<CycleReport> {
  if (isStandalone()) return { markedOverdue: 0, expired: [], issued: [], ranAt: now.toISOString() }
  const overdue = await prisma.invoice.updateMany({
    where: { status: 'ISSUED', dueAt: { lt: now } },
    data: { status: 'OVERDUE' },
  })

  // Expire schools whose paid-for period has run out and who owe money.
  const lapsed = await prisma.schoolSubscription.findMany({
    where: {
      status: 'ACTIVE',
      endDate: { not: null, lt: now },
      school: { invoices: { some: { status: { in: ['ISSUED', 'OVERDUE'] } } } },
    },
    select: { schoolId: true, school: { select: { name: true } } },
  })
  if (lapsed.length) {
    await prisma.schoolSubscription.updateMany({
      where: { schoolId: { in: lapsed.map((l) => l.schoolId) } },
      data: { status: 'EXPIRED' },
    })
  }

  // Invoice the next period for schools inside the renewal window.
  const renewalWindow = addDays(now, PAYMENT_TERMS_DAYS)
  const due = await prisma.schoolSubscription.findMany({
    where: {
      status: 'ACTIVE',
      // Only schools with an agreed price are billed.
      monthlyAmount: { gt: 0 },
      OR: [{ endDate: null }, { endDate: { lte: renewalWindow } }],
      school: { isActive: true },
    },
    select: { schoolId: true, endDate: true, school: { select: { name: true } } },
  })

  const issued: string[] = []
  for (const s of due) {
    // Skip anyone who already has an unpaid invoice waiting.
    const pending = await prisma.invoice.count({
      where: { schoolId: s.schoolId, status: { in: ['ISSUED', 'OVERDUE'] } },
    })
    if (pending > 0) continue
    const invoice = await issueInvoice({ schoolId: s.schoolId })
    if (invoice) issued.push(`${invoice.number} · ${s.school.name} · ${tzs(invoice.amount)}`)
  }

  return {
    markedOverdue: overdue.count,
    expired: lapsed.map((l) => l.school.name),
    issued,
    ranAt: now.toISOString(),
  }
}
