import { z } from 'zod'
import { prisma } from '@/lib/db'
import type { AccountType } from '@prisma/client'

/**
 * Accounting configuration and the default chart of accounts.
 *
 * The chart is seeded per school the first time accounting is touched; the
 * system accounts (cash, bank, fees income, salaries, statutory payables…)
 * are what automatic postings from fees and payroll land on, so they cannot
 * be deleted — only renamed.
 */

export interface ChartAccount { code: string; name: string; type: AccountType; subtype: string; system?: boolean }

export const DEFAULT_CHART: ChartAccount[] = [
  { code: '1000', name: 'Cash on hand', type: 'ASSET', subtype: 'CASH', system: true },
  { code: '1010', name: 'Bank — main account', type: 'ASSET', subtype: 'BANK', system: true },
  { code: '1020', name: 'Mobile money', type: 'ASSET', subtype: 'MOBILE_MONEY', system: true },
  { code: '1100', name: 'Fees receivable', type: 'ASSET', subtype: 'RECEIVABLE', system: true },
  { code: '1500', name: 'Furniture & equipment', type: 'ASSET', subtype: 'FIXED_ASSET' },
  { code: '1510', name: 'Vehicles', type: 'ASSET', subtype: 'FIXED_ASSET' },
  { code: '1520', name: 'Land & buildings', type: 'ASSET', subtype: 'FIXED_ASSET' },
  { code: '2000', name: 'Accounts payable', type: 'LIABILITY', subtype: 'PAYABLE' },
  { code: '2100', name: 'PAYE payable', type: 'LIABILITY', subtype: 'STATUTORY', system: true },
  { code: '2110', name: 'NSSF payable', type: 'LIABILITY', subtype: 'STATUTORY', system: true },
  { code: '2120', name: 'SDL payable', type: 'LIABILITY', subtype: 'STATUTORY', system: true },
  { code: '2130', name: 'WCF payable', type: 'LIABILITY', subtype: 'STATUTORY', system: true },
  { code: '2140', name: 'Staff deductions payable', type: 'LIABILITY', subtype: 'PAYABLE', system: true },
  { code: '2200', name: 'Fees received in advance', type: 'LIABILITY', subtype: 'PAYABLE' },
  { code: '2500', name: 'Loans', type: 'LIABILITY', subtype: 'LOAN' },
  { code: '3000', name: 'Capital', type: 'EQUITY', subtype: 'CAPITAL', system: true },
  { code: '3100', name: 'Accumulated surplus', type: 'EQUITY', subtype: 'RETAINED', system: true },
  { code: '4000', name: 'Tuition fees', type: 'INCOME', subtype: 'FEES', system: true },
  { code: '4010', name: 'Boarding fees', type: 'INCOME', subtype: 'FEES' },
  { code: '4020', name: 'Transport fees', type: 'INCOME', subtype: 'FEES' },
  { code: '4030', name: 'Registration & admission fees', type: 'INCOME', subtype: 'FEES' },
  { code: '4040', name: 'Examination fees', type: 'INCOME', subtype: 'FEES' },
  { code: '4050', name: 'Uniform & book sales', type: 'INCOME', subtype: 'OTHER_INCOME' },
  { code: '4100', name: 'Donations & grants', type: 'INCOME', subtype: 'OTHER_INCOME' },
  { code: '4900', name: 'Other income', type: 'INCOME', subtype: 'OTHER_INCOME' },
  { code: '5000', name: 'Salaries & wages', type: 'EXPENSE', subtype: 'STAFF_COST', system: true },
  { code: '5010', name: 'NSSF — employer contribution', type: 'EXPENSE', subtype: 'STAFF_COST', system: true },
  { code: '5020', name: 'Skills Development Levy', type: 'EXPENSE', subtype: 'STAFF_COST', system: true },
  { code: '5030', name: 'Workers Compensation Fund', type: 'EXPENSE', subtype: 'STAFF_COST', system: true },
  { code: '5100', name: 'Teaching & learning materials', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5110', name: 'Examinations & assessments', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5200', name: 'Food & catering', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5210', name: 'Electricity & water', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5220', name: 'Repairs & maintenance', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5230', name: 'Transport & fuel', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5240', name: 'Rent', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5300', name: 'Stationery & printing', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5310', name: 'Communication & internet', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5320', name: 'Bank charges', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5400', name: 'Insurance', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5500', name: 'Depreciation', type: 'EXPENSE', subtype: 'OPERATING' },
  { code: '5900', name: 'Miscellaneous', type: 'EXPENSE', subtype: 'OPERATING' },
]

const Code = z.string().regex(/^\d{3,6}$/, 'Account code must be 3–6 digits')

export const AccountingConfigSchema = z.object({
  /** 1 = January. Tanzanian schools mostly run January–December. */
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  autoPostFees: z.boolean(),
  autoPostPayroll: z.boolean(),
  /** Which account each automatic posting hits, by code. */
  accounts: z.object({
    cash: Code, bank: Code, mobileMoney: Code, feesReceivable: Code, feesIncome: Code,
    salaries: Code, employerNssf: Code, sdl: Code, wcf: Code,
    payePayable: Code, nssfPayable: Code, sdlPayable: Code, wcfPayable: Code, staffDeductionsPayable: Code,
    payrollPaidFrom: Code,
  }),
  /** Fee structures whose name contains the keyword post to this income account instead of feesIncome. */
  feeIncomeRules: z.array(z.object({ keyword: z.string().trim().min(1).max(40), code: Code })).max(20),
})
export type AccountingConfig = z.infer<typeof AccountingConfigSchema>

export const DEFAULT_ACCOUNTING_CONFIG: AccountingConfig = {
  fiscalYearStartMonth: 1,
  autoPostFees: true,
  autoPostPayroll: true,
  accounts: {
    cash: '1000', bank: '1010', mobileMoney: '1020', feesReceivable: '1100', feesIncome: '4000',
    salaries: '5000', employerNssf: '5010', sdl: '5020', wcf: '5030',
    payePayable: '2100', nssfPayable: '2110', sdlPayable: '2120', wcfPayable: '2130', staffDeductionsPayable: '2140',
    payrollPaidFrom: '1010',
  },
  feeIncomeRules: [
    { keyword: 'board', code: '4010' }, { keyword: 'hostel', code: '4010' },
    { keyword: 'transport', code: '4020' }, { keyword: 'bus', code: '4020' },
    { keyword: 'admission', code: '4030' }, { keyword: 'registration', code: '4030' },
    { keyword: 'exam', code: '4040' },
  ],
}

export async function loadAccountingConfig(schoolId: string): Promise<AccountingConfig> {
  const row = await prisma.accountingSettings.findUnique({ where: { schoolId } })
  if (!row) return DEFAULT_ACCOUNTING_CONFIG
  const parsed = AccountingConfigSchema.safeParse(row.config)
  if (!parsed.success) { console.error(`accounting settings for ${schoolId} invalid; using defaults`, parsed.error.issues[0]); return DEFAULT_ACCOUNTING_CONFIG }
  return parsed.data
}

export async function saveAccountingConfig(schoolId: string, config: AccountingConfig): Promise<AccountingConfig> {
  const clean = AccountingConfigSchema.parse(config)
  await prisma.accountingSettings.upsert({ where: { schoolId }, update: { config: clean as any }, create: { schoolId, config: clean as any } })
  return clean
}

/** Seeds the default chart for a school that has none yet; adds missing system accounts to an existing one. */
export async function ensureChart(schoolId: string): Promise<void> {
  const existing = new Set((await prisma.ledgerAccount.findMany({ where: { schoolId }, select: { code: true } })).map((a) => a.code))
  const missing = existing.size === 0 ? DEFAULT_CHART : DEFAULT_CHART.filter((a) => a.system && !existing.has(a.code))
  if (missing.length) {
    await prisma.ledgerAccount.createMany({ data: missing.map((a) => ({ schoolId, code: a.code, name: a.name, type: a.type, subtype: a.subtype, isSystem: !!a.system })) })
  }
}

/** Fiscal year containing a date: [start, end] and its label (the calendar year it starts in). */
export function fiscalYearFor(date: Date, startMonth: number): { year: number; start: Date; end: Date } {
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1
  const year = m >= startMonth ? y : y - 1
  const start = new Date(Date.UTC(year, startMonth - 1, 1))
  const end = new Date(Date.UTC(year + 1, startMonth - 1, 0, 23, 59, 59, 999))
  return { year, start, end }
}

export function fiscalYearBounds(year: number, startMonth: number) {
  return { start: new Date(Date.UTC(year, startMonth - 1, 1)), end: new Date(Date.UTC(year + 1, startMonth - 1, 0, 23, 59, 59, 999)) }
}
