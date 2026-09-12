export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { record } from '@/lib/audit'
import { runBillingCycle } from '@/lib/billing'

/**
 * The billing clock: marks invoices overdue, expires lapsed subscriptions, and
 * raises the next period's invoices.
 *
 * Run it daily. Either a SUPER_ADMIN session or a shared secret in
 * `x-billing-secret` (matching BILLING_CRON_SECRET) may trigger it, so a cron
 * job does not need a login.
 */
export async function POST(req: Request) {
  const secret = process.env.BILLING_CRON_SECRET
  const presented = req.headers.get('x-billing-secret')
  const viaSecret = Boolean(secret && presented && presented === secret)

  const session = await auth()
  const viaSuperAdmin = session?.user?.role === 'SUPER_ADMIN'

  if (!viaSecret && !viaSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await runBillingCycle()
    if (viaSuperAdmin) {
      await record(session, {
        action: 'update',
        entity: 'BillingCycle',
        summary:
          `Ran the billing cycle: ${report.markedOverdue} marked overdue, ` +
          `${report.expired.length} subscription(s) expired, ${report.issued.length} invoice(s) issued`,
      })
    }
    return NextResponse.json({ ok: true, ...report })
  } catch (e: any) {
    console.error('billing cycle failed:', e)
    return NextResponse.json({ error: 'The billing cycle failed' }, { status: 500 })
  }
}
