import { requirePageRole, ROLES } from '@/lib/authz'
import { ensureChart, loadAccountingConfig } from '@/lib/accounting/settings'
import { overview } from '@/lib/accounting/reports'
import { AccountingClient } from './accounting-client'

export const dynamic = 'force-dynamic'

/** Accounting: ledger, expenses, budgets and financial statements. */
export default async function AccountingPage() {
  const session = await requirePageRole(ROLES.accounting)
  const schoolId = session.user.schoolId
  if (!schoolId) return <p className="p-8 text-muted-foreground">No school assigned.</p>
  await ensureChart(schoolId)
  const cfg = await loadAccountingConfig(schoolId)
  const ov = await overview(schoolId, cfg)
  return <AccountingClient overview={ov} canConfigure={session.user.role === 'SCHOOL_ADMIN'} />
}
