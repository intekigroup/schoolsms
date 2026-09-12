export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { emailConfigured, sendEmailBroadcast } from '@/lib/email-broadcast'

/**
 * Email to parents (the office). Mirrors /api/sms: the audience is derived from
 * this school's pupils, never from a client-supplied list; guardians without an
 * email address are counted and skipped.
 *   GET   recent email log + whether a mail server is configured
 *   POST  { subject, text, audience: 'all-guardians'|'class-guardians'|'one', classId?, email? }
 *   PATCH same body → preview { recipients, missing }
 */
const Body = z.object({
  subject: z.string().trim().min(2, 'Subject is required').max(150),
  text: z.string().trim().min(2, 'Write the message').max(5000),
  audience: z.enum(['all-guardians', 'class-guardians', 'one']),
  classId: z.string().optional(),
  email: z.string().trim().toLowerCase().email().optional(),
})

async function audienceFor(schoolId: string, d: z.infer<typeof Body>) {
  if (d.audience === 'one') return { recipients: d.email ? [{ to: d.email, label: '' }] : [], missing: 0 }
  if (d.audience === 'class-guardians') {
    if (!d.classId) throw new Error('Choose a class')
    const cls = await prisma.class.findFirst({ where: { id: d.classId, schoolId }, select: { id: true } })
    if (!cls) throw new Error('Class not found')
  }
  const guardians = await prisma.guardian.findMany({
    where: { students: { some: { student: { schoolId, status: 'ACTIVE', ...(d.audience === 'class-guardians' ? { classId: d.classId } : {}) } } } },
    select: { firstName: true, lastName: true, email: true },
  })
  const seen = new Set<string>(); const recipients: { to: string; label: string }[] = []; let missing = 0
  for (const g of guardians) {
    const e = g.email?.trim().toLowerCase()
    if (!e) { missing++; continue }
    if (seen.has(e)) continue
    seen.add(e); recipients.push({ to: e, label: `${g.firstName} ${g.lastName}` })
  }
  return { recipients, missing }
}

export async function GET() {
  const guard = await requireApiRole(ROLES.announcements)
  if (!guard.ok) return guard.response
  const log = await prisma.smsLog.findMany({ where: { schoolId: guard.schoolId, channel: 'email' }, orderBy: { createdAt: 'desc' }, take: 50 })
  return NextResponse.json({ configured: emailConfigured(), log: log.map((l) => ({ id: l.id, to: l.phone, subject: l.subject, status: l.status, createdAt: l.createdAt })) })
}

export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.announcements)
  if (!guard.ok) return guard.response
  // A preview only needs the audience; subject and text come later.
  const parsed = Body.pick({ audience: true, classId: true, email: true }).safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  try { const a = await audienceFor(guard.schoolId, { ...parsed.data, subject: '', text: '' }); return NextResponse.json({ recipients: a.recipients.length, missing: a.missing, configured: emailConfigured() }) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.announcements, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const limited = rateLimit(req, 'write', `email:${schoolId}`)
  if (limited) return limited
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  let audience
  try { audience = await audienceFor(schoolId, parsed.data) } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }
  if (audience.recipients.length === 0) return NextResponse.json({ error: audience.missing ? `None of the ${audience.missing} guardian(s) has an email address on record.` : 'No recipients matched that audience.' }, { status: 400 })
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } })
  const dispatch = await sendEmailBroadcast(schoolId, audience.recipients, parsed.data.subject, parsed.data.text, school?.name)
  await record(guard.session, { action: 'create', entity: 'EmailBroadcast', summary: `Emailed ${dispatch.requested} recipient(s) (${dispatch.delivered} accepted, ${dispatch.failed} failed, ${audience.missing} without an address): "${parsed.data.subject.slice(0, 60)}"` })
  return NextResponse.json({ ok: true, configured: dispatch.configured, requested: dispatch.requested, delivered: dispatch.delivered, failed: dispatch.failed, missing: audience.missing, failures: dispatch.results.filter((r) => !r.delivered).slice(0, 10) })
}
