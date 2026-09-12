import { z } from 'zod'
import { prisma } from '@/lib/db'

/**
 * Per-school HR & payroll configuration, edited under Settings → HR & Payroll.
 * Defaults follow Tanzanian statute as at 2024/25: PAYE monthly bands, NSSF
 * 10% + 10%, SDL 3.5% and WCF 0.5% on gross (both employer costs), a
 * Monday–Friday working week and the Employment and Labour Relations Act
 * leave entitlements.
 */

export const LeaveTypeSchema = z.object({
  key: z.string().trim().regex(/^[A-Z_]{2,20}$/, 'Use capitals and underscores, e.g. ANNUAL'),
  name: z.string().trim().min(1).max(40),
  /** Entitlement in working days per calendar year (0 = unlimited / as approved). */
  daysPerYear: z.number().int().min(0).max(366),
  paid: z.boolean(),
})

export const PayeBracket = z.object({
  /** Upper bound of monthly taxable pay for this band, inclusive; null = no upper bound. */
  upTo: z.number().int().min(1).nullable(),
  /** Marginal rate as a percentage on pay above the previous band. */
  rate: z.number().min(0).max(100),
})

export const HrConfigSchema = z.object({
  leaveTypes: z.array(LeaveTypeSchema).min(1).max(12),
  /** Working days, 1 = Monday … 7 = Sunday. */
  workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  payroll: z.object({
    /** PAYE bands, lowest first. The first band's rate is normally 0. */
    payeBrackets: z.array(PayeBracket).min(1).max(8),
    nssfEmployeeRate: z.number().min(0).max(50),
    nssfEmployerRate: z.number().min(0).max(50),
    sdlEnabled: z.boolean(),
    sdlRate: z.number().min(0).max(20),
    wcfEnabled: z.boolean(),
    wcfRate: z.number().min(0).max(20),
    /** Day of the month wages are normally paid, for the payslip. */
    payDay: z.number().int().min(1).max(31),
    payslipNote: z.string().trim().max(200),
  }),
})

export type HrConfig = z.infer<typeof HrConfigSchema>
export type LeaveType = z.infer<typeof LeaveTypeSchema>

export const DEFAULT_HR_CONFIG: HrConfig = {
  leaveTypes: [
    { key: 'ANNUAL', name: 'Annual leave', daysPerYear: 28, paid: true },
    { key: 'SICK', name: 'Sick leave', daysPerYear: 126, paid: true },
    { key: 'MATERNITY', name: 'Maternity leave', daysPerYear: 84, paid: true },
    { key: 'PATERNITY', name: 'Paternity leave', daysPerYear: 3, paid: true },
    { key: 'COMPASSIONATE', name: 'Compassionate leave', daysPerYear: 4, paid: true },
    { key: 'STUDY', name: 'Study leave', daysPerYear: 0, paid: true },
    { key: 'UNPAID', name: 'Unpaid leave', daysPerYear: 0, paid: false },
  ],
  workingDays: [1, 2, 3, 4, 5],
  payroll: {
    payeBrackets: [
      { upTo: 270_000, rate: 0 },
      { upTo: 520_000, rate: 8 },
      { upTo: 760_000, rate: 20 },
      { upTo: 1_000_000, rate: 25 },
      { upTo: null, rate: 30 },
    ],
    nssfEmployeeRate: 10,
    nssfEmployerRate: 10,
    sdlEnabled: true,
    sdlRate: 3.5,
    wcfEnabled: true,
    wcfRate: 0.5,
    payDay: 28,
    payslipNote: 'Queries about this payslip should reach the bursar within 7 days.',
  },
}

export function normaliseHrConfig(input: HrConfig): HrConfig {
  const brackets = [...input.payroll.payeBrackets].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity))
  // Exactly one open-ended band, and it must be last.
  const open = brackets.filter((b) => b.upTo === null)
  const closed = brackets.filter((b) => b.upTo !== null)
  const payeBrackets = [...closed, open[0] ?? { upTo: null, rate: closed[closed.length - 1]?.rate ?? 0 }]
  const workingDays = [...new Set(input.workingDays)].sort((a, b) => a - b)
  return { ...input, workingDays, payroll: { ...input.payroll, payeBrackets } }
}

export async function loadHrConfig(schoolId: string): Promise<HrConfig> {
  const row = await prisma.hrSettings.findUnique({ where: { schoolId } })
  if (!row) return DEFAULT_HR_CONFIG
  const parsed = HrConfigSchema.safeParse(row.config)
  if (!parsed.success) {
    console.error(`hr settings for ${schoolId} are invalid; using defaults`, parsed.error.issues[0])
    return DEFAULT_HR_CONFIG
  }
  return normaliseHrConfig(parsed.data)
}

export async function saveHrConfig(schoolId: string, config: HrConfig): Promise<HrConfig> {
  const clean = normaliseHrConfig(HrConfigSchema.parse(config))
  await prisma.hrSettings.upsert({
    where: { schoolId },
    update: { config: clean as any },
    create: { schoolId, config: clean as any },
  })
  return clean
}
