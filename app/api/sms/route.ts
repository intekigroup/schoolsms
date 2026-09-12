export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { sendSms, smsConfigured, smsProvider, normaliseTzPhone, segmentCount } from '@/lib/sms'
import { pageParam, limitParam, pageArgs } from '@/lib/paging'

/**
 * Broadcast SMS to guardians — the channel Tanzanian schools actually use to
 * reach parents.
 *
 * Audience is resolved server-side from the school's own records, so a caller
 * can never post an arbitrary recipient list belonging to someone else.
 */

const SendSchema = z.object({
  text: z.string({ required_error: 'Write the message to send' }).trim().min(1, 'Write the message to send').max(918),
  audience: z.enum(['all-guardians', 'class-guardians', 'one']),
  /** Required when audience is 'class-guardians'. */
  classId: z.string().optional(),
  /** Required when audience is 'one'. */
  phone: z.string().optional(),
})

/** Sends log, one page at a time (?page&limit), so the office can see what actually went out. */
export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.announcements)
  if (!guard.ok) return guard.response
  const { schoolId } = guard
  const { searchParams } = new URL(req.url)
  const page = pageParam(searchParams), pageSize = limitParam(searchParams)

  const [logs, total, sentToday] = await Promise.all([
    prisma.smsLog.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' }, ...pageArgs(page, pageSize) }),
    prisma.smsLog.count({ where: { schoolId } }),
    prisma.smsLog.count({
      where: { schoolId, status: 'sent', createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    }),
  ])

  return NextResponse.json({
    provider: smsProvider().name,
    configured: smsConfigured(),
    sentToday,
    page, pageSize, total,
    logs: logs.map((l) => ({
      id: l.id,
      phone: l.phone,
      message: l.message,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.announcements, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  // Broadcasts cost money per message; throttle them per school.
  const limited = rateLimit(req, 'write', `sms:${schoolId}`)
  if (limited) return limited

  const parsed = SendSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { text, audience, classId, phone } = parsed.data

  try {
    let recipients: { phone: string; label: string }[] = []

    if (audience === 'one') {
      if (!phone) return NextResponse.json({ error: 'Enter a phone number' }, { status: 400 })
      if (!normaliseTzPhone(phone)) {
        return NextResponse.json(
          { error: 'That is not a valid Tanzanian number. Use 0712345678 or +255712345678.' },
          { status: 400 }
        )
      }
      recipients = [{ phone, label: phone }]
    } else {
      // Guardians reach a school only through their children, so the audience is
      // derived from pupils in this school — never from a client-supplied list.
      const where =
        audience === 'class-guardians'
          ? { students: { some: { student: { schoolId, classId: classId ?? '' } } } }
          : { students: { some: { student: { schoolId } } } }

      if (audience === 'class-guardians') {
        if (!classId) return NextResponse.json({ error: 'Choose a class' }, { status: 400 })
        const cls = await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } })
        if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
      }

      const guardians = await prisma.guardian.findMany({
        where,
        select: { firstName: true, lastName: true, phone: true },
      })
      // One message per number: a guardian with three children gets one text.
      const seen = new Set<string>()
      for (const g of guardians) {
        const key = normaliseTzPhone(g.phone) ?? g.phone
        if (seen.has(key)) continue
        seen.add(key)
        recipients.push({ phone: g.phone, label: `${g.firstName} ${g.lastName}` })
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients matched that audience.' }, { status: 400 })
    }

    const dispatch = await sendSms(schoolId, recipients.map((r) => ({ to: r.phone, text })))

    await record(guard.session, {
      action: 'create',
      entity: 'SmsBroadcast',
      summary:
        `Sent SMS to ${dispatch.requested} recipient(s) via ${dispatch.provider} ` +
        `(${dispatch.delivered} accepted, ${dispatch.failed} failed, ${dispatch.segments} segment(s)): ` +
        `"${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`,
    })

    return NextResponse.json({
      ok: true,
      provider: dispatch.provider,
      configured: smsConfigured(),
      requested: dispatch.requested,
      delivered: dispatch.delivered,
      failed: dispatch.failed,
      segments: dispatch.segments,
      // Surface the first few failures so the office can fix bad numbers.
      failures: dispatch.results.filter((r) => !r.delivered).slice(0, 10).map((r) => ({ to: r.to, error: r.error })),
    })
  } catch (e: any) {
    console.error('sms broadcast failed:', e)
    return NextResponse.json({ error: 'Could not send the messages' }, { status: 500 })
  }
}

/** Cost/reach preview before spending money. */
export async function PATCH(req: Request) {
  const guard = await requireApiRole(ROLES.announcements, req)
  if (!guard.ok) return guard.response
  const { schoolId } = guard

  const body = await req.json().catch(() => ({}))
  const text = String(body?.text ?? '')
  const audience = String(body?.audience ?? 'all-guardians')
  const classId = body?.classId ? String(body.classId) : undefined

  const where =
    audience === 'class-guardians' && classId
      ? { students: { some: { student: { schoolId, classId } } } }
      : { students: { some: { student: { schoolId } } } }

  const guardians = audience === 'one'
    ? []
    : await prisma.guardian.findMany({ where, select: { phone: true } })

  const unique = new Set(guardians.map((g) => normaliseTzPhone(g.phone) ?? g.phone))
  const reachable = [...unique].filter((p) => normaliseTzPhone(p)).length
  const segments = segmentCount(text)

  return NextResponse.json({
    recipients: audience === 'one' ? 1 : unique.size,
    reachable: audience === 'one' ? 1 : reachable,
    unreachable: audience === 'one' ? 0 : unique.size - reachable,
    segments,
    totalSegments: (audience === 'one' ? 1 : reachable) * segments,
  })
}
