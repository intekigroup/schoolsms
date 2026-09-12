export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { record } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { AccountingConfigSchema, DEFAULT_ACCOUNTING_CONFIG, ensureChart, loadAccountingConfig, saveAccountingConfig } from '@/lib/accounting/settings'

export async function GET() {
  const guard = await requireApiRole(ROLES.settingsRead)
  if (!guard.ok) return guard.response
  return NextResponse.json({ config: await loadAccountingConfig(guard.schoolId), defaults: DEFAULT_ACCOUNTING_CONFIG })
}

export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.settingsWrite, req)
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = AccountingConfigSchema.safeParse(body?.reset ? DEFAULT_ACCOUNTING_CONFIG : body?.config ?? body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue.path.join('.') || 'config'}: ${issue.message}` }, { status: 400 })
  }
  // Every mapped code must exist in this school's chart.
  await ensureChart(guard.schoolId)
  const codes = [...new Set([...Object.values(parsed.data.accounts), ...parsed.data.feeIncomeRules.map((r) => r.code)])]
  const found = new Set((await prisma.ledgerAccount.findMany({ where: { schoolId: guard.schoolId, code: { in: codes } }, select: { code: true } })).map((a) => a.code))
  const missing = codes.filter((c) => !found.has(c))
  if (missing.length) return NextResponse.json({ error: `No account with code ${missing.join(', ')} in your chart` }, { status: 400 })
  const config = await saveAccountingConfig(guard.schoolId, parsed.data)
  await record(guard.session, { action: 'update', entity: 'AccountingSettings', entityId: guard.schoolId, summary: body?.reset ? 'Reset accounting settings' : 'Updated accounting settings' })
  return NextResponse.json({ config })
}
