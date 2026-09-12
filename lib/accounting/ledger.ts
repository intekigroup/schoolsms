import { prisma } from '@/lib/db'
import type { Prisma, JournalSource } from '@prisma/client'
import { ensureChart, loadAccountingConfig, type AccountingConfig } from './settings'

/**
 * The general ledger. Every posting goes through `postEntry`, which insists
 * on debits = credits, whole shillings, and known accounts, and numbers the
 * entry. Automatic postings (fees, payroll, expenses) carry (source, sourceId)
 * which is unique, so replaying them is harmless.
 */

export interface LineInput { code?: string; accountId?: string; debit?: number; credit?: number; description?: string }
export interface EntryInput { date: Date; memo: string; reference?: string | null; source?: JournalSource; sourceId?: string | null; lines: LineInput[] }

type Tx = Prisma.TransactionClient

const r0 = (n: number) => Math.round(n)

async function nextNumber(tx: Tx, schoolId: string, date: Date): Promise<string> {
  const y = date.getUTCFullYear()
  const last = await tx.journalEntry.findFirst({ where: { schoolId, number: { startsWith: `JE-${y}-` } }, orderBy: { number: 'desc' }, select: { number: true } })
  const seq = last ? Number(last.number.slice(-5)) + 1 : 1
  return `JE-${y}-${String(seq).padStart(5, '0')}`
}

export class LedgerError extends Error {}

/**
 * Posts a balanced entry. Returns the existing entry when (source, sourceId)
 * was already posted, so callers can retry safely.
 */
export async function postEntry(schoolId: string, input: EntryInput, actorId?: string | null, txIn?: Tx) {
  const run = async (tx: Tx) => {
    if (input.source && input.source !== 'MANUAL' && input.sourceId) {
      const dup = await tx.journalEntry.findUnique({ where: { source_sourceId: { source: input.source, sourceId: input.sourceId } } })
      if (dup) return dup
    }
    const lines = input.lines.map((l) => ({ ...l, debit: r0(l.debit ?? 0), credit: r0(l.credit ?? 0) })).filter((l) => l.debit !== 0 || l.credit !== 0)
    if (lines.length < 2) throw new LedgerError('An entry needs at least two lines')
    for (const l of lines) {
      if (l.debit < 0 || l.credit < 0) throw new LedgerError('Amounts cannot be negative')
      if (l.debit > 0 && l.credit > 0) throw new LedgerError('A line is either a debit or a credit, not both')
    }
    const dr = lines.reduce((s, l) => s + l.debit, 0), cr = lines.reduce((s, l) => s + l.credit, 0)
    if (dr !== cr) throw new LedgerError(`Entry does not balance: debits ${dr.toLocaleString('en-GB')} ≠ credits ${cr.toLocaleString('en-GB')}`)

    const codes = [...new Set(lines.map((l) => l.code).filter((c): c is string => !!c))]
    const ids = [...new Set(lines.map((l) => l.accountId).filter((c): c is string => !!c))]
    const accounts = await tx.ledgerAccount.findMany({ where: { schoolId, OR: [{ code: { in: codes } }, { id: { in: ids } }] } })
    const byCode = new Map(accounts.map((a) => [a.code, a])), byId = new Map(accounts.map((a) => [a.id, a]))
    const resolved = lines.map((l) => {
      const a = l.accountId ? byId.get(l.accountId) : l.code ? byCode.get(l.code) : undefined
      if (!a) throw new LedgerError(`Unknown account ${l.code ?? l.accountId}`)
      if (!a.active) throw new LedgerError(`Account ${a.code} ${a.name} is closed`)
      return { accountId: a.id, debit: l.debit, credit: l.credit, description: l.description ?? null }
    })
    const number = await nextNumber(tx, schoolId, input.date)
    return tx.journalEntry.create({
      data: {
        schoolId, number, date: input.date, memo: input.memo, reference: input.reference ?? null,
        source: input.source ?? 'MANUAL', sourceId: input.sourceId ?? null, createdById: actorId ?? null,
        lines: { create: resolved },
      },
    })
  }
  return txIn ? run(txIn) : prisma.$transaction(run)
}

export async function voidEntry(schoolId: string, id: string, reason: string) {
  const entry = await prisma.journalEntry.findFirst({ where: { id, schoolId } })
  if (!entry) throw new LedgerError('Entry not found')
  if (entry.status === 'VOID') throw new LedgerError('Entry is already void')
  return prisma.journalEntry.update({ where: { id }, data: { status: 'VOID', voidedAt: new Date(), voidReason: reason } })
}

// ─── Automatic postings ─────────────────────────────────────────────────────

function cashAccountFor(method: string, cfg: AccountingConfig) {
  if (method === 'CASH') return cfg.accounts.cash
  if (method === 'BANK_TRANSFER') return cfg.accounts.bank
  return cfg.accounts.mobileMoney // MPESA, TIGOPESA, AIRTEL_MONEY
}

function feeIncomeFor(feeName: string, cfg: AccountingConfig) {
  const n = feeName.toLowerCase()
  for (const r of cfg.feeIncomeRules) if (n.includes(r.keyword.toLowerCase())) return r.code
  return cfg.accounts.feesIncome
}

/** Dr cash/bank/mobile, Cr fee income — one entry per completed receipt. */
export async function postFeePayment(schoolId: string, paymentId: string, actorId?: string | null) {
  const cfg = await loadAccountingConfig(schoolId)
  if (!cfg.autoPostFees) return null
  await ensureChart(schoolId)
  const p = await prisma.feePayment.findFirst({ where: { id: paymentId, student: { schoolId } }, include: { feeStructure: { select: { name: true } }, student: { select: { firstName: true, lastName: true, admissionNo: true } } } })
  if (!p || p.paymentStatus !== 'COMPLETED' || p.amount <= 0) return null
  return postEntry(schoolId, {
    date: p.paidAt, memo: `Fee receipt ${p.receiptNo ?? ''} — ${p.student.firstName} ${p.student.lastName} (${p.student.admissionNo}) · ${p.feeStructure.name}`.trim(),
    reference: p.receiptNo ?? p.transactionRef ?? null, source: 'FEE', sourceId: p.id,
    lines: [
      { code: cashAccountFor(p.paymentMethod, cfg), debit: p.amount, description: p.paymentMethod.replace('_', ' ') },
      { code: feeIncomeFor(p.feeStructure.name, cfg), credit: p.amount, description: p.feeStructure.name },
    ],
  }, actorId)
}

/** Posts every completed receipt that has no entry yet. Returns how many were posted. */
export async function backfillFees(schoolId: string, actorId?: string | null): Promise<number> {
  await ensureChart(schoolId)
  const posted = new Set((await prisma.journalEntry.findMany({ where: { schoolId, source: 'FEE' }, select: { sourceId: true } })).map((e) => e.sourceId))
  const payments = await prisma.feePayment.findMany({ where: { student: { schoolId }, paymentStatus: 'COMPLETED' }, select: { id: true }, orderBy: { paidAt: 'asc' } })
  let n = 0
  for (const p of payments) if (!posted.has(p.id)) { if (await postFeePayment(schoolId, p.id, actorId)) n++ }
  return n
}

/**
 * Payroll posting when a run is marked paid:
 *   Dr salaries (gross), Dr employer NSSF, Dr SDL, Dr WCF
 *   Cr PAYE payable, Cr NSSF payable (employee + employer), Cr SDL payable, Cr WCF payable,
 *   Cr staff deductions payable (loans etc.), Cr bank (net)
 */
export async function postPayrollRun(schoolId: string, runId: string, actorId?: string | null) {
  const cfg = await loadAccountingConfig(schoolId)
  if (!cfg.autoPostPayroll) return null
  await ensureChart(schoolId)
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, schoolId } })
  if (!run || run.status !== 'PAID') return null
  const a = cfg.accounts
  const lines: LineInput[] = [
    { code: a.salaries, debit: run.totalGross, description: 'Gross salaries' },
    { code: a.employerNssf, debit: run.totalNssfEmployer, description: 'Employer NSSF' },
    { code: a.sdl, debit: run.totalSdl, description: 'SDL' },
    { code: a.wcf, debit: run.totalWcf, description: 'WCF' },
    { code: a.payePayable, credit: run.totalPaye, description: 'PAYE withheld' },
    { code: a.nssfPayable, credit: run.totalNssfEmployee + run.totalNssfEmployer, description: 'NSSF employee + employer' },
    { code: a.sdlPayable, credit: run.totalSdl },
    { code: a.wcfPayable, credit: run.totalWcf },
    { code: a.staffDeductionsPayable, credit: run.totalDeductions, description: 'Loans and other deductions' },
    { code: a.payrollPaidFrom, credit: run.totalNet, description: 'Net salaries paid' },
  ]
  return postEntry(schoolId, { date: run.paidAt ?? new Date(), memo: `Payroll ${run.period}`, reference: run.period, source: 'PAYROLL', sourceId: run.id, lines }, actorId)
}

export async function backfillPayroll(schoolId: string, actorId?: string | null): Promise<number> {
  const runs = await prisma.payrollRun.findMany({ where: { schoolId, status: 'PAID' }, select: { id: true } })
  const posted = new Set((await prisma.journalEntry.findMany({ where: { schoolId, source: 'PAYROLL' }, select: { sourceId: true } })).map((e) => e.sourceId))
  let n = 0
  for (const r of runs) if (!posted.has(r.id)) { if (await postPayrollRun(schoolId, r.id, actorId)) n++ }
  return n
}

/** Records an expense and its entry (Dr expense account, Cr cash/bank) atomically. */
export async function recordExpense(schoolId: string, input: { date: Date; payee: string; description: string; amount: number; accountId: string; paidFromId: string; reference?: string | null }, actorId?: string | null) {
  await ensureChart(schoolId)
  const amount = r0(input.amount)
  if (amount <= 0) throw new LedgerError('Amount must be above zero')
  const [acct, from] = await Promise.all([
    prisma.ledgerAccount.findFirst({ where: { id: input.accountId, schoolId, type: 'EXPENSE' } }),
    prisma.ledgerAccount.findFirst({ where: { id: input.paidFromId, schoolId, type: 'ASSET' } }),
  ])
  if (!acct) throw new LedgerError('Choose an expense account')
  if (!from) throw new LedgerError('Choose the cash, bank or mobile money account it was paid from')
  return prisma.$transaction(async (tx) => {
    const y = input.date.getUTCFullYear()
    const last = await tx.expense.findFirst({ where: { schoolId, number: { startsWith: `EXP-${y}-` } }, orderBy: { number: 'desc' }, select: { number: true } })
    const number = `EXP-${y}-${String(last ? Number(last.number.slice(-5)) + 1 : 1).padStart(5, '0')}`
    const expense = await tx.expense.create({ data: { schoolId, number, date: input.date, payee: input.payee, description: input.description, amount, accountId: acct.id, paidFromId: from.id, reference: input.reference ?? null, createdById: actorId ?? null } })
    const entry = await postEntry(schoolId, {
      date: input.date, memo: `${number} — ${input.payee}: ${input.description}`, reference: input.reference ?? number, source: 'EXPENSE', sourceId: expense.id,
      lines: [{ accountId: acct.id, debit: amount, description: input.description }, { accountId: from.id, credit: amount, description: `Paid to ${input.payee}` }],
    }, actorId, tx)
    await tx.expense.update({ where: { id: expense.id }, data: { journalEntryId: entry.id } })
    return { expense: { ...expense, journalEntryId: entry.id }, entry }
  })
}

/**
 * Removes automatic entries whose source record no longer exists (a deleted
 * receipt or payroll run). Manual and expense entries are never touched.
 */
export async function pruneOrphans(schoolId: string): Promise<number> {
  const auto = await prisma.journalEntry.findMany({ where: { schoolId, source: { in: ['FEE', 'PAYROLL'] } }, select: { id: true, source: true, sourceId: true } })
  const feeIds = auto.filter((e) => e.source === 'FEE').map((e) => e.sourceId!).filter(Boolean)
  const runIds = auto.filter((e) => e.source === 'PAYROLL').map((e) => e.sourceId!).filter(Boolean)
  const [fees, runs] = await Promise.all([
    prisma.feePayment.findMany({ where: { id: { in: feeIds } }, select: { id: true } }),
    prisma.payrollRun.findMany({ where: { id: { in: runIds } }, select: { id: true } }),
  ])
  const live = new Set([...fees.map((f) => f.id), ...runs.map((r) => r.id)])
  const orphan = auto.filter((e) => e.sourceId && !live.has(e.sourceId)).map((e) => e.id)
  if (orphan.length) await prisma.journalEntry.deleteMany({ where: { id: { in: orphan }, schoolId } })
  return orphan.length
}
