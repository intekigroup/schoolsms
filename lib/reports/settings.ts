import { z } from 'zod'
import { prisma } from '@/lib/db'

/**
 * Per-school academic report configuration.
 *
 * Everything a head teacher might reasonably want to change about how results
 * are graded, combined and presented lives here, editable under Settings →
 * Reports. Defaults follow Tanzanian practice: NECTA-style A–F bands with
 * points 1–5, continuous assessment weighted against the end-of-term exam, and
 * CSEE divisions computed from the best seven subjects for O-level classes.
 */

export const GradeBand = z.object({
  grade: z.string().trim().min(1).max(3),
  /** Minimum percentage for this band (inclusive). */
  min: z.number().min(0).max(100),
  /** NECTA points: A=1 … F=5. Lower is better. */
  points: z.number().int().min(1).max(9),
  remark: z.string().trim().max(40),
})

export const DivisionBand = z.object({
  name: z.string().trim().min(1).max(4),
  /** Highest points total (inclusive) that still earns this division. */
  maxPoints: z.number().int().min(1).max(99),
})

export const ReportConfigSchema = z.object({
  /** Grade bands, highest first. The last band is the floor. */
  scale: z.array(GradeBand).min(2).max(10),
  /**
   * How assessments within a term combine into a subject mark, by exam type,
   * as percentages. Types absent from a term are dropped and the rest are
   * re-normalised, so a subject with only an end-of-term exam counts it fully.
   */
  weights: z.object({
    CAT: z.number().min(0).max(100),
    MIDTERM: z.number().min(0).max(100),
    END_OF_TERM: z.number().min(0).max(100),
    MOCK: z.number().min(0).max(100),
    NECTA_MOCK: z.number().min(0).max(100),
    NECTA: z.number().min(0).max(100),
  }),
  division: z.object({
    /** Compute CSEE-style divisions for O-level classes. */
    enabled: z.boolean(),
    /** Number of best subjects whose points are summed. */
    bestOf: z.number().int().min(1).max(15),
    /** Division bands, best first. Beyond the last band is "0" (fail). */
    bands: z.array(DivisionBand).min(1).max(8),
  }),
  ranking: z.object({
    enabled: z.boolean(),
    by: z.enum(['average', 'total']),
  }),
  /** Which report documents the school produces. */
  reports: z.object({
    reportCard: z.boolean(),
    classSheet: z.boolean(),
    subjectAnalysis: z.boolean(),
    performanceSummary: z.boolean(),
  }),
  /** Report card layout options. */
  card: z.object({
    showPosition: z.boolean(),
    showSubjectPosition: z.boolean(),
    showClassAverage: z.boolean(),
    showPoints: z.boolean(),
    showAttendance: z.boolean(),
    showRemarks: z.boolean(),
    showConduct: z.boolean(),
    showSignatures: z.boolean(),
    /** Free text printed at the foot, e.g. "Next term begins 12 January 2027". */
    footerNote: z.string().trim().max(160),
    /** Auto remark when no class-teacher remark has been written, by grade. */
    autoRemarks: z.boolean(),
  }),
})

export type ReportConfig = z.infer<typeof ReportConfigSchema>
export type GradeBandT = z.infer<typeof GradeBand>

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  scale: [
    { grade: 'A', min: 75, points: 1, remark: 'Excellent' },
    { grade: 'B', min: 65, points: 2, remark: 'Very good' },
    { grade: 'C', min: 45, points: 3, remark: 'Good' },
    { grade: 'D', min: 30, points: 4, remark: 'Satisfactory' },
    { grade: 'F', min: 0, points: 5, remark: 'Fail' },
  ],
  weights: { CAT: 40, MIDTERM: 0, END_OF_TERM: 60, MOCK: 0, NECTA_MOCK: 0, NECTA: 0 },
  division: {
    enabled: true,
    bestOf: 7,
    bands: [
      { name: 'I', maxPoints: 17 },
      { name: 'II', maxPoints: 21 },
      { name: 'III', maxPoints: 25 },
      { name: 'IV', maxPoints: 33 },
    ],
  },
  ranking: { enabled: true, by: 'average' },
  reports: { reportCard: true, classSheet: true, subjectAnalysis: true, performanceSummary: true },
  card: {
    showPosition: true,
    showSubjectPosition: false,
    showClassAverage: true,
    showPoints: true,
    showAttendance: true,
    showRemarks: true,
    showConduct: true,
    showSignatures: true,
    footerNote: '',
    autoRemarks: true,
  },
}

/** Sorts bands highest-first and guarantees a floor at 0. */
export function normaliseConfig(input: ReportConfig): ReportConfig {
  const scale = [...input.scale].sort((a, b) => b.min - a.min)
  if (scale[scale.length - 1].min !== 0) scale[scale.length - 1] = { ...scale[scale.length - 1], min: 0 }
  const bands = [...input.division.bands].sort((a, b) => a.maxPoints - b.maxPoints)
  return { ...input, scale, division: { ...input.division, bands } }
}

/** Loads the school's config, falling back to defaults field by field. */
export async function loadReportConfig(schoolId: string): Promise<ReportConfig> {
  const row = await prisma.reportSettings.findUnique({ where: { schoolId } })
  if (!row) return DEFAULT_REPORT_CONFIG
  const parsed = ReportConfigSchema.safeParse(row.config)
  if (!parsed.success) {
    console.error(`report settings for ${schoolId} are invalid; using defaults`, parsed.error.issues[0])
    return DEFAULT_REPORT_CONFIG
  }
  return normaliseConfig(parsed.data)
}

export async function saveReportConfig(schoolId: string, config: ReportConfig): Promise<ReportConfig> {
  const clean = normaliseConfig(ReportConfigSchema.parse(config))
  await prisma.reportSettings.upsert({
    where: { schoolId },
    update: { config: clean as any },
    create: { schoolId, config: clean as any },
  })
  return clean
}

/** Grade for a percentage under a scale (bands highest-first). */
export function gradeFor(pct: number, scale: GradeBandT[]): GradeBandT {
  for (const band of scale) if (pct >= band.min) return band
  return scale[scale.length - 1]
}
