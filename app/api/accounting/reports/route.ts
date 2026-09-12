export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { attachment, SCHOOL_HEADER_SELECT } from '@/lib/pdf'
import { ensureChart, loadAccountingConfig } from '@/lib/accounting/settings'
import { accountLedger, balanceSheet, budgetVsActual, debtorsAgeing, incomeStatement, overview, trialBalance } from '@/lib/accounting/reports'
import { renderBalanceSheet, renderBudget, renderDebtors, renderIncomeStatement, renderLedger, renderTrialBalance } from '@/lib/accounting/pdf'

/**
 * Financial statements.
 *   ?type=overview
 *   ?type=income-statement&from&to        ?type=balance-sheet&asAt      ?type=trial-balance&asAt
 *   ?type=ledger&accountId&from&to        (cash book when the account is cash/bank/mobile)
 *   ?type=budget&fiscalYear               ?type=debtors&asAt
 *   &format=pdf for a PDF, &format=csv for the rows, JSON otherwise.
 */
const day = (s: string | null, end = false) => (s ? new Date(`${s}T${end ? '23:59:59.999' : '00:00:00.000'}Z`) : null)

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.accounting)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'overview'
  const format = searchParams.get('format')
  await ensureChart(schoolId)
  const cfg = await loadAccountingConfig(schoolId)
  const now = new Date()
  const asAt = day(searchParams.get('asAt'), true) ?? now
  const from = day(searchParams.get('from')) ?? new Date(Date.UTC(now.getUTCFullYear(), cfg.fiscalYearStartMonth - 1, 1))
  const to = day(searchParams.get('to'), true) ?? now
  const fiscalYear = Number(searchParams.get('fiscalYear') ?? now.getUTCFullYear())

  let data: any, render: (() => Promise<Uint8Array>) | null = null, name = type, csv: string[][] | null = null
  const school = () => prisma.school.findUnique({ where: { id: schoolId }, select: SCHOOL_HEADER_SELECT }).then((s) => s!)
  switch (type) {
    case 'overview': data = await overview(schoolId, cfg); break
    case 'income-statement': data = await incomeStatement(schoolId, from, to); render = async () => renderIncomeStatement(data, await school())
      csv = [['Section', 'Code', 'Account', 'Amount'], ...data.income.flatMap((g: any) => g.items.map((i: any) => ['Income', i.code, i.name, i.balance])), ...data.expenses.flatMap((g: any) => g.items.map((i: any) => ['Expense', i.code, i.name, i.balance])), ['', '', 'Surplus', data.surplus]]; break
    case 'balance-sheet': data = await balanceSheet(schoolId, asAt, cfg); render = async () => renderBalanceSheet(data, await school())
      csv = [['Section', 'Code', 'Account', 'Amount'], ...data.assets.map((i: any) => ['Asset', i.code, i.name, i.balance]), ...data.liabilities.map((i: any) => ['Liability', i.code, i.name, i.balance]), ...data.equity.map((i: any) => ['Equity', i.code, i.name, i.balance]), ['Equity', '', 'Surplus to date', data.surplus]]; break
    case 'trial-balance': data = await trialBalance(schoolId, asAt); render = async () => renderTrialBalance(data, await school())
      csv = [['Code', 'Account', 'Debit', 'Credit'], ...data.rows.map((r: any) => [r.code, r.name, r.drBalance, r.crBalance])]; break
    case 'ledger': {
      const accountId = searchParams.get('accountId')
      if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
      data = await accountLedger(schoolId, accountId, from, to)
      if (!data) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
      const cashBook = ['CASH', 'BANK', 'MOBILE_MONEY'].includes(data.account.subtype ?? '')
      name = cashBook ? `cash-book-${data.account.code}` : `ledger-${data.account.code}`
      render = async () => renderLedger(data, await school(), cashBook ? 'Cash book' : 'Account ledger')
      csv = [['Date', 'Entry', 'Memo', 'Description', 'Debit', 'Credit', 'Balance'], ...data.rows.map((r: any) => [r.date.toISOString().slice(0, 10), r.number, r.memo, r.description ?? '', r.debit, r.credit, r.running])]
      break
    }
    case 'budget': data = await budgetVsActual(schoolId, fiscalYear, cfg); render = async () => renderBudget(data, await school()); name = `budget-${fiscalYear}`
      csv = [['Type', 'Code', 'Account', 'Budget', 'Actual', 'Variance'], ...data.rows.map((r: any) => [r.type, r.code, r.name, r.budget, r.actual, r.variance])]; break
    case 'debtors': data = await debtorsAgeing(schoolId, asAt); render = async () => renderDebtors(data, await school())
      csv = [['Pupil', 'Admission', 'Class', 'Guardian', 'Expected', 'Paid', 'Balance', 'Days'], ...data.rows.map((r: any) => [r.name, r.admissionNo, r.className, r.guardian ?? '', r.expected, r.paid, r.balance, r.days])]; break
    default: return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
  }
  if (!format || format === 'json') return NextResponse.json(data)
  const limited = rateLimit(req, 'report', guard.session.user.id)
  if (limited) return limited
  await record(guard.session, { action: 'export', entity: 'FinancialReport', entityId: null, summary: `Generated ${type} (${format})` })
  if (format === 'csv' && csv) {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    return new NextResponse(csv.map((r) => r.map(esc).join(',')).join('\n') + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': attachment(`${name}.csv`), 'Cache-Control': 'no-store' } })
  }
  if (format === 'pdf' && render) {
    return new NextResponse(Buffer.from(await render()), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': attachment(`${name}.pdf`), 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ error: 'format must be json, pdf or csv' }, { status: 400 })
}
