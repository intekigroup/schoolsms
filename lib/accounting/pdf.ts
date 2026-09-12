import { startDoc, header, table, footer, text, textRight, gap, rule, ensureRoom, tzs, A4, MARGIN, ACCENT, SOFT, INK, type SchoolHeader } from '@/lib/pdf'
import type { accountLedger, balanceSheet, budgetVsActual, debtorsAgeing, incomeStatement, trialBalance } from './reports'

type Awaited_<T> = T extends Promise<infer U> ? U : T
const n = (v: number) => Math.round(v).toLocaleString('en-GB')
const d = (v: Date) => v.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const right = A4[0] - MARGIN
const label = (doc: any, t: string) => { ensureRoom(doc, 40); text(doc, t.toUpperCase(), { size: 8, bold: true, color: SOFT }); gap(doc, 14) }
const totalLine = (doc: any, t: string, v: number, strong = false) => { ensureRoom(doc, 20); text(doc, t, { size: strong ? 10.5 : 9.5, bold: true }); textRight(doc, tzs(v), right, { size: strong ? 11 : 9.5, bold: true, color: strong ? ACCENT : INK }); gap(doc, strong ? 20 : 15) }
const printed = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: process.env.SCHOOL_TIMEZONE || 'Africa/Dar_es_Salaam' })
const SUBTYPE: Record<string, string> = { CASH: 'Cash', BANK: 'Bank', MOBILE_MONEY: 'Mobile money', RECEIVABLE: 'Receivables', FIXED_ASSET: 'Fixed assets', PAYABLE: 'Payables', STATUTORY: 'Statutory liabilities', LOAN: 'Loans', CAPITAL: 'Capital', RETAINED: 'Accumulated surplus', FEES: 'Fee income', OTHER_INCOME: 'Other income', STAFF_COST: 'Staff costs', OPERATING: 'Operating expenses', OTHER: 'Other' }

export async function renderIncomeStatement(r: Awaited_<ReturnType<typeof incomeStatement>>, school: SchoolHeader) {
  const doc = await startDoc('Income statement', school)
  header(doc, school, `Income statement · ${d(r.from)} to ${d(r.to)}`)
  const section = (title: string, groups: typeof r.income, total: number) => {
    label(doc, title)
    for (const g of groups) {
      table(doc, [{ title: SUBTYPE[g.subtype] ?? g.subtype, width: 380 }, { title: '', width: 119, align: 'right' }], g.items.map((i) => [`${i.code}  ${i.name}`, n(i.balance)]))
    }
    if (groups.length === 0) { text(doc, 'Nothing recorded.', { size: 9.5, color: SOFT }); gap(doc, 16) }
    totalLine(doc, `Total ${title.toLowerCase()}`, total)
  }
  section('Income', r.income, r.totalIncome)
  gap(doc, 6)
  section('Expenses', r.expenses, r.totalExpenses)
  gap(doc, 4); rule(doc, ACCENT); gap(doc, 18)
  totalLine(doc, r.surplus >= 0 ? 'Surplus for the period' : 'Deficit for the period', r.surplus, true)
  footer(doc, `${school.name} · Income statement · Printed ${printed()}`)
  return doc.pdf.save()
}

export async function renderBalanceSheet(r: Awaited_<ReturnType<typeof balanceSheet>>, school: SchoolHeader) {
  const doc = await startDoc('Balance sheet', school)
  header(doc, school, `Statement of financial position · as at ${d(r.asAt)}`)
  const block = (title: string, rows: typeof r.assets) => {
    label(doc, title)
    table(doc, [{ title: 'ACCOUNT', width: 380 }, { title: 'TZS', width: 119, align: 'right' }], rows.map((i) => [`${i.code}  ${i.name}`, n(i.balance)]), { emptyMessage: 'None.' })
  }
  block('Assets', r.assets); totalLine(doc, 'Total assets', r.totalAssets, true)
  block('Liabilities', r.liabilities); totalLine(doc, 'Total liabilities', r.totalLiabilities)
  label(doc, 'Equity')
  table(doc, [{ title: 'ACCOUNT', width: 380 }, { title: 'TZS', width: 119, align: 'right' }], [...r.equity.map((i) => [`${i.code}  ${i.name}`, n(i.balance)]), ['Surplus to date (income less expenses)', n(r.surplus)]])
  totalLine(doc, 'Total equity', r.totalEquity)
  gap(doc, 4); rule(doc, ACCENT); gap(doc, 18)
  totalLine(doc, 'Total liabilities and equity', r.totalLiabilities + r.totalEquity, true)
  if (!r.balanced) { text(doc, 'Warning: the statement does not balance — check for void or unposted entries.', { size: 9, color: ACCENT }) }
  footer(doc, `${school.name} · Balance sheet · Printed ${printed()}`)
  return doc.pdf.save()
}

export async function renderTrialBalance(r: Awaited_<ReturnType<typeof trialBalance>>, school: SchoolHeader) {
  const doc = await startDoc('Trial balance', school)
  header(doc, school, `Trial balance · as at ${d(r.asAt)}`)
  table(doc, [{ title: 'CODE', width: 60 }, { title: 'ACCOUNT', width: 259 }, { title: 'DEBIT', width: 90, align: 'right' }, { title: 'CREDIT', width: 90, align: 'right' }],
    r.rows.map((x) => [x.code, x.name, x.drBalance ? n(x.drBalance) : '', x.crBalance ? n(x.crBalance) : '']), { emptyMessage: 'No postings yet.' })
  text(doc, 'Totals', { size: 9.5, bold: true }); textRight(doc, n(r.totalDebit), MARGIN + 60 + 259 + 90, { size: 9.5, bold: true }); textRight(doc, n(r.totalCredit), right, { size: 9.5, bold: true }); gap(doc, 16)
  text(doc, r.totalDebit === r.totalCredit ? 'Debits equal credits.' : 'Debits do not equal credits — investigate.', { size: 9, color: r.totalDebit === r.totalCredit ? SOFT : ACCENT })
  footer(doc, `${school.name} · Trial balance · Printed ${printed()}`)
  return doc.pdf.save()
}

export async function renderLedger(r: NonNullable<Awaited_<ReturnType<typeof accountLedger>>>, school: SchoolHeader, title = 'Account ledger') {
  const doc = await startDoc(`${title} · ${r.account.code}`, school)
  header(doc, school, `${title} · ${r.account.code} ${r.account.name} · ${d(r.from)} to ${d(r.to)}`)
  text(doc, 'Opening balance', { size: 9.5 }); textRight(doc, n(r.openingBalance), right, { size: 9.5, bold: true }); gap(doc, 16)
  table(doc, [{ title: 'DATE', width: 62 }, { title: 'ENTRY', width: 72 }, { title: 'PARTICULARS', width: 175 }, { title: 'DEBIT', width: 62, align: 'right' }, { title: 'CREDIT', width: 62, align: 'right' }, { title: 'BALANCE', width: 66, align: 'right' }],
    r.rows.map((x) => [d(x.date), x.number, (x.description ? `${x.memo} — ${x.description}` : x.memo).slice(0, 44), x.debit ? n(x.debit) : '', x.credit ? n(x.credit) : '', n(x.running)]), { emptyMessage: 'No movements in the period.' })
  text(doc, 'Period totals', { size: 9.5, bold: true }); textRight(doc, n(r.totalDebit), MARGIN + 62 + 72 + 175 + 62, { size: 9.5, bold: true }); textRight(doc, n(r.totalCredit), MARGIN + 62 + 72 + 175 + 62 + 62, { size: 9.5, bold: true }); gap(doc, 16)
  totalLine(doc, 'Closing balance', r.closingBalance, true)
  footer(doc, `${school.name} · ${title} ${r.account.code} · Printed ${printed()}`)
  return doc.pdf.save()
}

export async function renderBudget(r: Awaited_<ReturnType<typeof budgetVsActual>>, school: SchoolHeader) {
  const doc = await startDoc(`Budget vs actual ${r.fiscalYear}`, school)
  header(doc, school, `Budget vs actual · FY ${r.fiscalYear} (${d(r.start)} to ${d(r.end)})`)
  const cols = [{ title: 'ACCOUNT', width: 209 }, { title: 'BUDGET', width: 80, align: 'right' as const }, { title: 'ACTUAL', width: 80, align: 'right' as const }, { title: 'VARIANCE', width: 80, align: 'right' as const }, { title: '%', width: 50, align: 'right' as const }]
  const rows = (t: 'INCOME' | 'EXPENSE') => r.rows.filter((x) => x.type === t).map((x) => [`${x.code}  ${x.name}`, n(x.budget), n(x.actual), n(x.variance), x.pct === null ? '—' : `${x.pct}%`])
  label(doc, 'Income'); table(doc, cols, rows('INCOME'), { emptyMessage: 'No budgeted or actual income.' })
  text(doc, 'Total income', { size: 9.5, bold: true }); textRight(doc, `${n(r.income.budget)}  /  ${n(r.income.actual)}`, right, { size: 9.5, bold: true }); gap(doc, 18)
  label(doc, 'Expenses'); table(doc, cols, rows('EXPENSE'), { emptyMessage: 'No budgeted or actual expenses.' })
  text(doc, 'Total expenses', { size: 9.5, bold: true }); textRight(doc, `${n(r.expenses.budget)}  /  ${n(r.expenses.actual)}`, right, { size: 9.5, bold: true }); gap(doc, 14)
  text(doc, 'Variance is favourable when positive: income above budget, or expenses below it.', { size: 8.5, color: SOFT })
  footer(doc, `${school.name} · Budget vs actual FY ${r.fiscalYear} · Printed ${printed()}`)
  return doc.pdf.save()
}

export async function renderDebtors(r: Awaited_<ReturnType<typeof debtorsAgeing>>, school: SchoolHeader) {
  const doc = await startDoc('Debtors ageing', school)
  header(doc, school, `Fee debtors ageing · as at ${d(r.asAt)}`)
  label(doc, 'Summary')
  table(doc, [{ title: 'BUCKET', width: 300 }, { title: 'TZS', width: 199, align: 'right' }], [
    ['Current (0–30 days)', n(r.buckets.current)], ['31–60 days', n(r.buckets.d30)], ['61–90 days', n(r.buckets.d60)], ['Over 90 days', n(r.buckets.d90)],
  ])
  totalLine(doc, `Total outstanding from ${r.debtors} pupil(s)`, r.total, true)
  label(doc, 'Debtors')
  table(doc, [{ title: 'PUPIL', width: 150 }, { title: 'CLASS', width: 60 }, { title: 'GUARDIAN', width: 139 }, { title: 'DAYS', width: 40, align: 'right' }, { title: 'BALANCE', width: 110, align: 'right' }],
    r.rows.map((x) => [`${x.name} (${x.admissionNo})`, x.className, x.guardian ?? '—', String(x.days), n(x.balance)]), { emptyMessage: 'No outstanding fees.' })
  footer(doc, `${school.name} · Debtors ageing · Printed ${printed()}`)
  return doc.pdf.save()
}
