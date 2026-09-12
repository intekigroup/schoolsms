import { prisma } from '@/lib/db'
import { feeSettingsFor, discountFor } from '@/lib/fees/billing'
import type { AccountType } from '@prisma/client'
import { fiscalYearBounds, type AccountingConfig } from './settings'

/**
 * Financial statements computed straight from posted journal lines. Nothing
 * is cached or pre-aggregated: the numbers are always what the ledger says.
 *
 * Sign convention: assets and expenses carry debit balances, liabilities,
 * equity and income carry credit balances. `balance` here is always shown as
 * a positive "natural" balance for the account's type.
 */

export interface AccountBalance { id: string; code: string; name: string; type: AccountType; subtype: string | null; debit: number; credit: number; balance: number }

const natural = (type: AccountType, debit: number, credit: number) => (type === 'ASSET' || type === 'EXPENSE' ? debit - credit : credit - debit)

async function balances(schoolId: string, from: Date | null, to: Date, types?: AccountType[]): Promise<AccountBalance[]> {
  const accounts = await prisma.ledgerAccount.findMany({ where: { schoolId, ...(types ? { type: { in: types } } : {}) }, orderBy: { code: 'asc' } })
  const sums = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: { account: { schoolId }, entry: { status: 'POSTED', date: { ...(from ? { gte: from } : {}), lte: to } } },
    _sum: { debit: true, credit: true },
  })
  const m = new Map(sums.map((s) => [s.accountId, { debit: s._sum.debit ?? 0, credit: s._sum.credit ?? 0 }]))
  return accounts.map((a) => {
    const s = m.get(a.id) ?? { debit: 0, credit: 0 }
    return { id: a.id, code: a.code, name: a.name, type: a.type, subtype: a.subtype, debit: s.debit, credit: s.credit, balance: natural(a.type, s.debit, s.credit) }
  })
}

export async function trialBalance(schoolId: string, asAt: Date) {
  const rows = (await balances(schoolId, null, asAt)).filter((r) => r.debit || r.credit)
  const out = rows.map((r) => {
    const net = r.debit - r.credit
    return { ...r, drBalance: net > 0 ? net : 0, crBalance: net < 0 ? -net : 0 }
  })
  return { asAt, rows: out, totalDebit: out.reduce((s, r) => s + r.drBalance, 0), totalCredit: out.reduce((s, r) => s + r.crBalance, 0) }
}

export async function incomeStatement(schoolId: string, from: Date, to: Date) {
  const rows = await balances(schoolId, from, to, ['INCOME', 'EXPENSE'])
  const income = rows.filter((r) => r.type === 'INCOME' && r.balance !== 0)
  const expenses = rows.filter((r) => r.type === 'EXPENSE' && r.balance !== 0)
  const totalIncome = income.reduce((s, r) => s + r.balance, 0), totalExpenses = expenses.reduce((s, r) => s + r.balance, 0)
  const group = (list: AccountBalance[]) => {
    const g = new Map<string, AccountBalance[]>()
    for (const r of list) { const k = r.subtype ?? 'OTHER'; g.set(k, [...(g.get(k) ?? []), r]) }
    return [...g].map(([subtype, items]) => ({ subtype, items, total: items.reduce((s, r) => s + r.balance, 0) }))
  }
  return { from, to, income: group(income), expenses: group(expenses), totalIncome, totalExpenses, surplus: totalIncome - totalExpenses }
}

export async function balanceSheet(schoolId: string, asAt: Date, cfg: AccountingConfig) {
  const rows = await balances(schoolId, null, asAt)
  const assets = rows.filter((r) => r.type === 'ASSET' && r.balance !== 0)
  const liabilities = rows.filter((r) => r.type === 'LIABILITY' && r.balance !== 0)
  const equity = rows.filter((r) => r.type === 'EQUITY' && r.balance !== 0)
  // Surplus to date (all income − all expenses up to asAt) closes into equity.
  const pl = rows.filter((r) => r.type === 'INCOME' || r.type === 'EXPENSE')
  const surplus = pl.filter((r) => r.type === 'INCOME').reduce((s, r) => s + r.balance, 0) - pl.filter((r) => r.type === 'EXPENSE').reduce((s, r) => s + r.balance, 0)
  const totalAssets = assets.reduce((s, r) => s + r.balance, 0)
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0)
  const totalEquity = equity.reduce((s, r) => s + r.balance, 0) + surplus
  return { asAt, assets, liabilities, equity, surplus, totalAssets, totalLiabilities, totalEquity, balanced: totalAssets === totalLiabilities + totalEquity, fiscalYearStartMonth: cfg.fiscalYearStartMonth }
}

export interface LedgerLine { date: Date; number: string; memo: string; reference: string | null; description: string | null; debit: number; credit: number; running: number; entryId: string }

/** Account ledger / cash book with running balance. */
export async function accountLedger(schoolId: string, accountId: string, from: Date, to: Date) {
  const account = await prisma.ledgerAccount.findFirst({ where: { id: accountId, schoolId } })
  if (!account) return null
  const opening = await prisma.journalLine.aggregate({ where: { accountId, entry: { status: 'POSTED', date: { lt: from } } }, _sum: { debit: true, credit: true } })
  let running = natural(account.type, opening._sum.debit ?? 0, opening._sum.credit ?? 0)
  const openingBalance = running
  const lines = await prisma.journalLine.findMany({
    where: { accountId, entry: { status: 'POSTED', date: { gte: from, lte: to } } },
    orderBy: [{ entry: { date: 'asc' } }, { entry: { number: 'asc' } }],
    include: { entry: { select: { id: true, date: true, number: true, memo: true, reference: true } } },
  })
  const rows: LedgerLine[] = lines.map((l) => {
    running += natural(account.type, l.debit, l.credit)
    return { date: l.entry.date, number: l.entry.number, memo: l.entry.memo, reference: l.entry.reference, description: l.description, debit: l.debit, credit: l.credit, running, entryId: l.entry.id }
  })
  return { account, from, to, openingBalance, rows, closingBalance: running, totalDebit: rows.reduce((s, r) => s + r.debit, 0), totalCredit: rows.reduce((s, r) => s + r.credit, 0) }
}

export async function budgetVsActual(schoolId: string, fiscalYear: number, cfg: AccountingConfig) {
  const { start, end } = fiscalYearBounds(fiscalYear, cfg.fiscalYearStartMonth)
  const rows = await balances(schoolId, start, end, ['INCOME', 'EXPENSE'])
  const budgets = await prisma.budget.findMany({ where: { schoolId, fiscalYear } })
  const b = new Map(budgets.map((x) => [x.accountId, x.amount]))
  const out = rows.filter((r) => b.has(r.id) || r.balance !== 0).map((r) => {
    const budget = b.get(r.id) ?? 0
    return { ...r, budget, actual: r.balance, variance: r.type === 'INCOME' ? r.balance - budget : budget - r.balance, pct: budget ? Math.round((r.balance / budget) * 100) : null }
  })
  const sum = (t: AccountType, k: 'budget' | 'actual') => out.filter((r) => r.type === t).reduce((s, r) => s + r[k], 0)
  return { fiscalYear, start, end, rows: out, income: { budget: sum('INCOME', 'budget'), actual: sum('INCOME', 'actual') }, expenses: { budget: sum('EXPENSE', 'budget'), actual: sum('EXPENSE', 'actual') } }
}

/**
 * Debtors ageing from the fee ledger: for every active pupil, expected fees
 * (school-wide structures plus the class's) less completed payments. Age is
 * counted from the oldest unpaid structure's due date, or the current
 * academic year's start when no due date is set.
 */
export async function debtorsAgeing(schoolId: string, asAt: Date) {
  const [students, structures, payments, year] = await Promise.all([
    prisma.student.findMany({ where: { schoolId, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, admissionNo: true, classId: true, class: { select: { name: true } }, guardians: { take: 1, orderBy: { isPrimary: 'desc' }, select: { guardian: { select: { phone: true, firstName: true, lastName: true } } } } } }),
    prisma.feeStructure.findMany({ where: { schoolId }, select: { id: true, name: true, amount: true, classId: true, dueDate: true, discountable: true } }),
    prisma.feePayment.groupBy({ by: ['studentId', 'feeStructureId'], where: { student: { schoolId }, paymentStatus: 'COMPLETED', paidAt: { lte: asAt } }, _sum: { amount: true } }),
    prisma.academicYear.findFirst({ where: { schoolId }, orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }], select: { startDate: true } }),
  ])
  const paid = new Map(payments.map((p) => [`${p.studentId}:${p.feeStructureId}`, p._sum.amount ?? 0]))
  const fallbackDue = year?.startDate ?? new Date(Date.UTC(asAt.getUTCFullYear(), 0, 1))
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 }
  // Sibling discount: rank each pupil within their family (pupils sharing a guardian), eldest first.
  const [feeSettings, famLinks, dobs] = await Promise.all([
    feeSettingsFor(schoolId),
    prisma.studentGuardian.findMany({ where: { student: { schoolId, status: 'ACTIVE' } }, select: { studentId: true, guardianId: true } }),
    prisma.student.findMany({ where: { schoolId, status: 'ACTIVE' }, select: { id: true, dateOfBirth: true, admissionNo: true } }),
  ])
  const byGuardian = new Map<string, Set<string>>()
  for (const l of famLinks) byGuardian.set(l.guardianId, (byGuardian.get(l.guardianId) ?? new Set()).add(l.studentId))
  const order = new Map(dobs.sort((a, b) => a.dateOfBirth.getTime() - b.dateOfBirth.getTime() || a.admissionNo.localeCompare(b.admissionNo)).map((d, i) => [d.id, i]))
  const rankOf = (id: string) => { const fam = new Set<string>([id]); for (const l of famLinks) if (l.studentId === id) for (const m of byGuardian.get(l.guardianId) ?? []) fam.add(m); if (fam.size < 2) return 1; return [...fam].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)).indexOf(id) + 1 }
  const rows = students.map((s) => {
    const applicable = structures.filter((f) => !f.classId || f.classId === s.classId)
    const pct = discountFor(rankOf(s.id), feeSettings)
    let expected = 0, paidTotal = 0, oldest: Date | null = null
    const items: { name: string; expected: number; paid: number; due: Date }[] = []
    for (const f of applicable) {
      const p = paid.get(`${s.id}:${f.id}`) ?? 0
      const net = f.discountable && pct ? f.amount - Math.round(f.amount * pct / 100) : f.amount
      expected += net; paidTotal += p
      if (p < net) { const due = f.dueDate ?? fallbackDue; if (!oldest || due < oldest) oldest = due; items.push({ name: f.name, expected: net, paid: p, due }) }
    }
    const balance = Math.round(expected - paidTotal)
    const days = oldest ? Math.max(0, Math.floor((asAt.getTime() - oldest.getTime()) / 86400000)) : 0
    const bucket = balance <= 0 ? null : days <= 30 ? 'current' : days <= 60 ? 'd30' : days <= 90 ? 'd60' : 'd90'
    if (bucket) buckets[bucket] += balance
    const g = s.guardians[0]?.guardian
    return { studentId: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo, className: s.class?.name ?? '—', guardian: g ? `${g.firstName} ${g.lastName} · ${g.phone}` : null, expected: Math.round(expected), paid: Math.round(paidTotal), balance, days, bucket, items }
  }).filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance)
  return { asAt, rows, buckets, total: rows.reduce((s, r) => s + r.balance, 0), debtors: rows.length }
}

/** Numbers for the accounting dashboard header. */
export async function overview(schoolId: string, cfg: AccountingConfig) {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [cash, month, ageing] = await Promise.all([
    balances(schoolId, null, now, ['ASSET']),
    incomeStatement(schoolId, monthStart, now),
    debtorsAgeing(schoolId, now),
  ])
  const liquid = cash.filter((a) => ['CASH', 'BANK', 'MOBILE_MONEY'].includes(a.subtype ?? ''))
  return {
    cashAccounts: liquid.map((a) => ({ code: a.code, name: a.name, balance: a.balance })),
    cashTotal: liquid.reduce((s, a) => s + a.balance, 0),
    monthIncome: month.totalIncome, monthExpenses: month.totalExpenses, monthSurplus: month.surplus,
    debtorsTotal: ageing.total, debtors: ageing.debtors,
    fiscalYearStartMonth: cfg.fiscalYearStartMonth,
  }
}
