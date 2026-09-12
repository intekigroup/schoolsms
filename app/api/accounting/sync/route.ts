export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { record } from '@/lib/audit'
import { backfillFees, backfillPayroll, pruneOrphans } from '@/lib/accounting/ledger'

/** Posts any completed fee receipts and paid payroll runs not yet in the ledger, and drops entries whose source was deleted. Idempotent. */
export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.accounting, req)
  if (!guard.ok) return guard.response
  const fees = await backfillFees(guard.schoolId, guard.session.user.id)
  const payroll = await backfillPayroll(guard.schoolId, guard.session.user.id)
  const pruned = await pruneOrphans(guard.schoolId)
  if (fees || payroll || pruned) await record(guard.session, { action: 'create', entity: 'JournalEntry', entityId: null, summary: `Synced ledger: ${fees} fee receipt(s), ${payroll} payroll run(s) posted, ${pruned} orphan entr(ies) removed` })
  return NextResponse.json({ fees, payroll, pruned })
}
