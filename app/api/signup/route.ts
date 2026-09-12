export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { rateLimit } from '@/lib/rate-limit'
import { isStandalone } from '@/lib/edition'
import { prisma } from '@/lib/db'
import { createVerificationToken, VERIFY_TTL_HOURS } from '@/lib/email-verification'
import { sendMail, mailTransport } from '@/lib/mailer'
import { normaliseTzPhone } from '@/lib/sms/types'
import { TZ_REGIONS, defaultTerms } from '@/lib/tz'
import { CONTACT_EMAIL, SITE_URL } from '@/lib/site'
import { PLAN_LIMITS } from '@/lib/billing'

/**
 * Self-serve school registration. One request creates the school, its FREE
 * subscription, the first academic year with three terms, and the admin
 * login; the role is decided here and never read from the body.
 *
 * The office-run edition has no public signup at all.
 */
const Term = z.object({ name: z.string().trim().min(1).max(30), startDate: z.string().date(), endDate: z.string().date() })
const Body = z.object({
  // Step 1 — the person
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255),
  phone: z.string().trim().min(9, 'Enter your phone number').max(20),
  jobTitle: z.string().trim().max(60).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  // Step 2 — the school
  schoolName: z.string().trim().min(2, 'School name must be at least 2 characters').max(150),
  shortName: z.string().trim().max(20).optional(),
  schoolType: z.enum(['PRIVATE', 'FAITH', 'COMMUNITY', 'INTERNATIONAL', 'OTHER']).optional(),
  levels: z.array(z.enum(['NURSERY', 'PRIMARY', 'O_LEVEL', 'A_LEVEL'])).min(1, 'Choose at least one level'),
  approxPupils: z.number().int().min(1).max(100000).optional(),
  region: z.string().trim().min(1, 'Choose a region').max(40),
  district: z.string().trim().max(60).optional(),
  address: z.string().trim().max(200).optional(),
  schoolPhone: z.string().trim().max(20).optional(),
  schoolEmail: z.string().trim().toLowerCase().email().max(255).optional().or(z.literal('')),
  website: z.string().trim().max(120).optional(),
  motto: z.string().trim().max(120).optional(),
  // Step 3 — the year and preferences
  academicYear: z.number().int().min(2020).max(2100).optional(),
  terms: z.array(Term).min(1).max(4).optional(),
  preferredLocale: z.enum(['en', 'sw']).optional(),
  referralSource: z.string().trim().max(40).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms of service' }) }),
})

export async function POST(req: Request) {
  if (isStandalone()) {
    return NextResponse.json({ error: 'Self-service sign-up is not available on this installation. Ask the school office for an account.' }, { status: 404 })
  }
  const limited = rateLimit(req, 'authIp')
  if (limited) return limited

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: issue?.message ?? 'Invalid signup details', field: issue?.path?.[0] ?? null }, { status: 400 })
  }
  const d = parsed.data
  if (!(TZ_REGIONS as readonly string[]).includes(d.region)) return NextResponse.json({ error: 'Choose a region from the list', field: 'region' }, { status: 400 })
  const phone = normaliseTzPhone(d.phone)
  if (!phone) return NextResponse.json({ error: 'Enter a valid Tanzanian phone number (e.g. 0745 389 941)', field: 'phone' }, { status: 400 })
  const year = d.academicYear ?? new Date().getUTCFullYear()
  const terms = (d.terms ?? defaultTerms(year)).map((t) => ({ ...t, start: new Date(`${t.startDate}T00:00:00Z`), end: new Date(`${t.endDate}T23:59:59Z`) }))
  for (const t of terms) if (t.end <= t.start) return NextResponse.json({ error: `${t.name}: end date must be after the start date`, field: 'terms' }, { status: 400 })
  for (let i = 1; i < terms.length; i++) if (terms[i].start <= terms[i - 1].end) return NextResponse.json({ error: `${terms[i].name} starts before ${terms[i - 1].name} ends`, field: 'terms' }, { status: 400 })

  try {
    const exists = await prisma.user.findUnique({ where: { email: d.email }, select: { id: true } })
    if (exists) return NextResponse.json({ error: 'Email already registered', field: 'email' }, { status: 409 })

    const hashedPassword = await bcrypt.hash(d.password, 12)
    const user = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: d.schoolName, shortName: d.shortName || null, schoolType: d.schoolType ?? null, schoolLevel: d.levels,
          approxPupils: d.approxPupils ?? null, region: d.region, district: d.district || null, city: d.district || d.region,
          address: d.address || null, phone: d.schoolPhone ? (normaliseTzPhone(d.schoolPhone) ? `+${normaliseTzPhone(d.schoolPhone)}` : d.schoolPhone) : `+${phone}`,
          email: d.schoolEmail || d.email, website: d.website || null, motto: d.motto || null,
          preferredLocale: d.preferredLocale ?? 'en', referralSource: d.referralSource || null, termsAcceptedAt: new Date(),
          subscription: { create: { plan: 'FREE', maxStudents: PLAN_LIMITS.FREE.maxStudents, maxStaff: PLAN_LIMITS.FREE.maxStaff } },
          academicYears: {
            create: {
              name: String(year), startDate: terms[0].start, endDate: terms[terms.length - 1].end, isCurrent: true,
              terms: { create: terms.map((t, i) => ({ name: t.name, startDate: t.start, endDate: t.end, isCurrent: i === 0 })) },
            },
          },
        },
      })
      return tx.user.create({
        data: { email: d.email, name: d.name, phone: `+${phone}`, jobTitle: d.jobTitle || null, hashedPassword, role: 'SCHOOL_ADMIN', locale: d.preferredLocale ?? 'en', schoolId: school.id },
        select: { id: true, name: true, email: true, role: true, schoolId: true },
      })
    })

    // Email must be confirmed before the account can sign in.
    const token = await createVerificationToken(user.id)
    const origin = SITE_URL || new URL(req.url).origin
    const sw = d.preferredLocale === 'sw'
    await sendMail({
      to: d.email,
      subject: sw ? 'Thibitisha akaunti yako ya Shule SMS' : 'Confirm your Shule SMS account',
      text: [
        sw ? `Habari ${d.name},` : `Hello ${d.name},`,
        '',
        sw ? `Asante kwa kusajili ${d.schoolName}. Thibitisha barua pepe yako ili kuwasha akaunti. Kiungo hiki kinaisha baada ya saa ${VERIFY_TTL_HOURS}.`
           : `Thank you for registering ${d.schoolName}. Confirm your email address to activate the account. This link expires in ${VERIFY_TTL_HOURS} hours.`,
        '',
        `${origin}/verify-email?token=${encodeURIComponent(token)}`,
        '',
        sw ? 'Ukishaingia, dashibodi ina orodha ya hatua za kuanza: madarasa, masomo, walimu, wanafunzi na ada.'
           : 'Once you sign in, the dashboard has a step-by-step checklist: classes, subjects, staff, pupils and fees.',
      ].join('\n'),
    })

    // Tell the people who follow up on new schools.
    const lead = `${d.schoolName} (${d.region}${d.district ? `, ${d.district}` : ''}) — ${d.levels.join('/')}${d.approxPupils ? `, ~${d.approxPupils} pupils` : ''}. Contact ${d.name}${d.jobTitle ? ` (${d.jobTitle})` : ''}, +${phone}, ${d.email}.${d.referralSource ? ` Heard via ${d.referralSource}.` : ''}`
    try {
      const supers = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } })
      if (supers.length) await prisma.notification.createMany({ data: supers.map((s) => ({ userId: s.id, title: 'New school registered', message: lead.slice(0, 500) })) })
      if (CONTACT_EMAIL) await sendMail({ to: CONTACT_EMAIL, subject: `New school registered: ${d.schoolName}`, text: `${lead}\n\nSuper-admin console: ${origin}/dashboard/super-admin` })
    } catch (e) { console.error('lead notification failed', e) }

    return NextResponse.json({ success: true, requiresVerification: true, emailConfigured: mailTransport() === 'smtp', user })
  } catch (e: any) {
    console.error('Signup error:', e)
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Email already registered', field: 'email' }, { status: 409 })
    return NextResponse.json({ error: 'Could not create account' }, { status: 500 })
  }
}
