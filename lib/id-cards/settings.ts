import { z } from 'zod'
import { prisma } from '@/lib/db'

/**
 * Per-school ID card design, edited under Settings → ID Cards. One design
 * serves pupils and staff; the holder-specific fields are chosen per kind.
 */

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0B6E93')

export const IdCardConfigSchema = z.object({
  /** Card orientation. CR80 is 85.6 × 54 mm either way. */
  orientation: z.enum(['landscape', 'portrait']),
  theme: z.object({
    /** Header band and accents. */
    accent: Hex,
    /** Secondary stripe. */
    secondary: Hex,
    /** Text on the accent band. */
    onAccent: Hex,
  }),
  /** Show the school logo (School.logoUrl) in the header when set. */
  showLogo: z.boolean(),
  showMotto: z.boolean(),
  student: z.object({
    title: z.string().trim().min(1).max(24),
    showClass: z.boolean(),
    showAdmissionNo: z.boolean(),
    showDateOfBirth: z.boolean(),
    showGender: z.boolean(),
    showGuardianPhone: z.boolean(),
    /** Printed as "Valid until …". Free text so a school can write "Dec 2026" or "End of Form 4". */
    validUntil: z.string().trim().max(40),
  }),
  staff: z.object({
    title: z.string().trim().min(1).max(24),
    showEmployeeNo: z.boolean(),
    showRole: z.boolean(),
    showPhone: z.boolean(),
    validUntil: z.string().trim().max(40),
  }),
  qr: z.object({
    /** QR code that opens the public verification page. */
    enabled: z.boolean(),
  }),
  back: z.object({
    enabled: z.boolean(),
    /** Rules / conditions of use. */
    note: z.string().trim().max(400),
    /** "If found, return to …" — defaults to the school's address and phone when blank. */
    returnTo: z.string().trim().max(160),
    showSignature: z.boolean(),
    signatureLabel: z.string().trim().max(40),
    /** Emergency contact line on pupil cards (guardian). */
    showEmergencyContact: z.boolean(),
  }),
  sheet: z.object({
    /** Crop marks on A4 batch sheets. */
    cropMarks: z.boolean(),
  }),
})

export type IdCardConfig = z.infer<typeof IdCardConfigSchema>

export const DEFAULT_ID_CARD_CONFIG: IdCardConfig = {
  orientation: 'landscape',
  theme: { accent: '#0B6E93', secondary: '#1FA97A', onAccent: '#FFFFFF' },
  showLogo: true,
  showMotto: true,
  student: {
    title: 'STUDENT',
    showClass: true,
    showAdmissionNo: true,
    showDateOfBirth: true,
    showGender: false,
    showGuardianPhone: true,
    validUntil: '',
  },
  staff: {
    title: 'STAFF',
    showEmployeeNo: true,
    showRole: true,
    showPhone: true,
    validUntil: '',
  },
  qr: { enabled: true },
  back: {
    enabled: true,
    note: 'This card is the property of the school and must be carried at all times on school premises. It is not transferable. Report loss to the school office immediately.',
    returnTo: '',
    showSignature: true,
    signatureLabel: 'Head Teacher',
    showEmergencyContact: true,
  },
  sheet: { cropMarks: true },
}

export async function loadIdCardConfig(schoolId: string): Promise<IdCardConfig> {
  const row = await prisma.idCardSettings.findUnique({ where: { schoolId } })
  if (!row) return DEFAULT_ID_CARD_CONFIG
  const parsed = IdCardConfigSchema.safeParse(row.config)
  if (!parsed.success) {
    console.error(`id card settings for ${schoolId} are invalid; using defaults`, parsed.error.issues[0])
    return DEFAULT_ID_CARD_CONFIG
  }
  return parsed.data
}

export async function saveIdCardConfig(schoolId: string, config: IdCardConfig): Promise<IdCardConfig> {
  const clean = IdCardConfigSchema.parse(config)
  await prisma.idCardSettings.upsert({
    where: { schoolId },
    update: { config: clean as any },
    create: { schoolId, config: clean as any },
  })
  return clean
}
