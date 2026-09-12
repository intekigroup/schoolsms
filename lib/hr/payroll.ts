import { prisma } from '@/lib/db'
import type { HrConfig } from './settings'

/**
 * Payroll arithmetic. Pure functions over whole shillings, so the numbers on
 * a payslip can be checked by hand against the TRA tables.
 *
 * Order of operations, as TRA expects:
 *   gross        = basic + all allowances
 *   taxable pay  = basic + taxable allowances − employee NSSF (NSSF is deductible)
 *   PAYE         = marginal bands over taxable pay
 *   net          = gross − employee NSSF − PAYE − other deductions
 * Employer-side costs (employer NSSF, SDL, WCF) never touch the net.
 */

export interface PayLine { name: string; amount: number; taxable?: boolean }

export interface PayslipFigures {
  basic: number
  allowances: PayLine[]
  deductions: PayLine[]
  gross: number
  taxablePay: number
  nssfEmployee: number
  nssfEmployer: number
  paye: number
  otherDeductions: number
  net: number
  sdl: number
  wcf: number
  employerCost: number
}

const r0 = (n: number) => Math.round(n)

/** Monthly PAYE from the configured marginal bands. */
export function computePaye(taxable: number, brackets: HrConfig['payroll']['payeBrackets']): number {
  if (taxable <= 0) return 0
  let tax = 0, lower = 0
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity
    if (taxable > lower) {
      const slice = Math.min(taxable, upper) - lower
      tax += slice * (b.rate / 100)
    }
    if (taxable <= upper) break
    lower = upper
  }
  return r0(tax)
}

export function computePayslip(basic: number, items: PayLine[], kinds: ('ALLOWANCE' | 'DEDUCTION')[], config: HrConfig['payroll']): PayslipFigures {
  const allowances = items.filter((_, i) => kinds[i] === 'ALLOWANCE').map((a) => ({ name: a.name, amount: r0(a.amount), taxable: a.taxable !== false }))
  const deductions = items.filter((_, i) => kinds[i] === 'DEDUCTION').map((d) => ({ name: d.name, amount: r0(d.amount) }))
  const b = r0(basic)
  const gross = b + allowances.reduce((s, a) => s + a.amount, 0)
  const nssfEmployee = r0(gross * (config.nssfEmployeeRate / 100))
  const nssfEmployer = r0(gross * (config.nssfEmployerRate / 100))
  const taxableGross = b + allowances.filter((a) => a.taxable).reduce((s, a) => s + a.amount, 0)
  const taxablePay = Math.max(0, taxableGross - nssfEmployee)
  const paye = computePaye(taxablePay, config.payeBrackets)
  const otherDeductions = deductions.reduce((s, d) => s + d.amount, 0)
  const net = gross - nssfEmployee - paye - otherDeductions
  const sdl = config.sdlEnabled ? r0(gross * (config.sdlRate / 100)) : 0
  const wcf = config.wcfEnabled ? r0(gross * (config.wcfRate / 100)) : 0
  return { basic: b, allowances, deductions, gross, taxablePay, nssfEmployee, nssfEmployer, paye, otherDeductions, net, sdl, wcf, employerCost: gross + nssfEmployer + sdl + wcf }
}

export function periodLabel(period: string) {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * (Re)builds every payslip in a draft run from current staff salaries and pay
 * items. Approved and paid runs are frozen and refuse this.
 */
export async function buildRun(runId: string, schoolId: string, config: HrConfig): Promise<{ count: number }> {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, schoolId } })
  if (!run) throw new Error('Payroll run not found')
  if (run.status !== 'DRAFT') throw new Error('Only a draft run can be recomputed')

  const staff = await prisma.staff.findMany({
    where: { schoolId, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: { payItems: { where: { active: true }, orderBy: { createdAt: 'asc' } } },
  })

  const totals = { totalBasic: 0, totalGross: 0, totalPaye: 0, totalNssfEmployee: 0, totalNssfEmployer: 0, totalSdl: 0, totalWcf: 0, totalDeductions: 0, totalNet: 0 }
  const existing = await prisma.payslip.findMany({ where: { runId }, select: { id: true, staffId: true, number: true } })
  const byStaff = new Map(existing.map((p) => [p.staffId, p]))
  let seq = 0
  const numbers = new Set(existing.map((p) => p.number))
  const nextNumber = () => {
    let n: string
    do { seq += 1; n = `PS-${run.period}-${String(seq).padStart(4, '0')}` } while (numbers.has(n))
    numbers.add(n)
    return n
  }

  await prisma.$transaction(async (tx) => {
    const keep = new Set<string>()
    for (const s of staff) {
      const f = computePayslip(s.salary, s.payItems.map((i) => ({ name: i.name, amount: i.amount, taxable: i.taxable })), s.payItems.map((i) => i.kind), config.payroll)
      const data = {
        staffName: `${s.firstName} ${s.lastName}`, employeeNo: s.employeeNo, role: s.role,
        basic: f.basic, allowances: f.allowances as any, deductions: f.deductions as any, gross: f.gross, taxablePay: f.taxablePay,
        nssfEmployee: f.nssfEmployee, nssfEmployer: f.nssfEmployer, paye: f.paye, otherDeductions: f.otherDeductions, net: f.net, sdl: f.sdl, wcf: f.wcf,
        bankName: s.bankName, bankAccount: s.bankAccount, nssfNo: s.nssfNo, tin: s.tin,
      }
      const prev = byStaff.get(s.id)
      if (prev) await tx.payslip.update({ where: { id: prev.id }, data })
      else await tx.payslip.create({ data: { runId, staffId: s.id, number: nextNumber(), ...data } })
      keep.add(s.id)
      totals.totalBasic += f.basic; totals.totalGross += f.gross; totals.totalPaye += f.paye
      totals.totalNssfEmployee += f.nssfEmployee; totals.totalNssfEmployer += f.nssfEmployer
      totals.totalSdl += f.sdl; totals.totalWcf += f.wcf; totals.totalDeductions += f.otherDeductions; totals.totalNet += f.net
    }
    // Staff who left since the draft was made drop out of it.
    const stale = existing.filter((p) => !keep.has(p.staffId)).map((p) => p.id)
    if (stale.length) await tx.payslip.deleteMany({ where: { id: { in: stale } } })
    await tx.payrollRun.update({ where: { id: runId }, data: totals })
  })
  return { count: staff.length }
}
