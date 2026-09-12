export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { sendSms } from '@/lib/sms'
import { sendEmailBroadcast } from '@/lib/email-broadcast'
import { record } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { canMessage, contactsFor } from '@/lib/messaging'

/**
 * Teacher ↔ guardian messages, always about one pupil.
 *   GET                              conversations (other party + pupil, last message, unread) and my contacts
 *   GET ?with=<userId>&studentId=    the thread; marks it read
 *   POST { studentId, recipientId, body }
 */
const Body = z.object({ studentId: z.string().min(1), recipientId: z.string().min(1), body: z.string().trim().min(1).max(2000), sms: z.boolean().optional(), email: z.boolean().optional() })

export async function GET(req: Request) {
  const guard = await requireApiRole(ROLES.messaging)
  if (!guard.ok) return guard.response
  const { schoolId, session } = guard
  const me = session.user.id
  const { searchParams } = new URL(req.url)
  const withId = searchParams.get('with'), studentId = searchParams.get('studentId')

  if (withId && studentId) {
    const thread = await prisma.message.findMany({
      where: { ...(session.user.role === 'PARENT' ? {} : { schoolId }), studentId, OR: [{ senderId: me, recipientId: withId }, { senderId: withId, recipientId: me }] },
      orderBy: { createdAt: 'asc' }, take: 500,
      include: { sender: { select: { name: true, role: true } } },
    })
    await prisma.message.updateMany({ where: { ...(session.user.role === 'PARENT' ? {} : { schoolId }), studentId, senderId: withId, recipientId: me, readAt: null }, data: { readAt: new Date() } })
    return NextResponse.json({ messages: thread.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt, mine: m.senderId === me, senderName: m.sender.name, senderRole: m.sender.role, readAt: m.readAt, viaSms: m.viaSms, viaEmail: m.viaEmail, delivery: m.delivery })) })
  }

  const [contacts, recent] = await Promise.all([
    contactsFor(session),
    prisma.message.findMany({
      where: { ...(session.user.role === 'PARENT' ? {} : { schoolId }), OR: [{ senderId: me }, { recipientId: me }] },
      orderBy: { createdAt: 'desc' }, take: 1000,
      include: { sender: { select: { id: true, name: true, role: true } }, recipient: { select: { id: true, name: true, role: true } }, student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } } },
    }),
  ])
  const seen = new Map<string, any>()
  for (const m of recent) {
    const other = m.senderId === me ? m.recipient : m.sender
    const key = `${other.id}:${m.studentId}`
    if (!seen.has(key)) seen.set(key, { userId: other.id, name: other.name, role: other.role, studentId: m.studentId, studentName: `${m.student.firstName} ${m.student.lastName}`, className: m.student.class?.name ?? null, last: m.body, lastAt: m.createdAt, lastMine: m.senderId === me, unread: 0 })
    if (m.recipientId === me && !m.readAt) seen.get(key).unread += 1
  }
  return NextResponse.json({ conversations: [...seen.values()], contacts, unread: recent.filter((m) => m.recipientId === me && !m.readAt).length })
}

export async function POST(req: Request) {
  const guard = await requireApiRole(ROLES.messaging, req)
  if (!guard.ok) return guard.response
  const { schoolId, session } = guard
  const limited = rateLimit(req, 'write', session.user.id)
  if (limited) return limited
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { studentId, recipientId, body } = parsed.data
  if (recipientId === session.user.id) return NextResponse.json({ error: 'You cannot message yourself' }, { status: 400 })
  if (!(await canMessage(session, studentId, recipientId))) return NextResponse.json({ error: 'You can only message the guardians and teachers of a pupil you share' }, { status: 403 })
  // Staff may also push the message out as an SMS and/or an email to the guardian; guardians reply in-app.
  const staff = session.user.role !== 'PARENT'
  const wantSms = staff && parsed.data.sms === true, wantEmail = staff && parsed.data.email === true
  const pupil = await prisma.student.findUnique({ where: { id: studentId }, select: { schoolId: true, school: { select: { name: true, shortName: true } } } })
  const msg = await prisma.message.create({ data: { schoolId: pupil?.schoolId ?? schoolId, studentId, senderId: session.user.id, recipientId, body, viaSms: wantSms, viaEmail: wantEmail }, include: { student: { select: { firstName: true, lastName: true } } } })
  const notes: string[] = []
  if (wantSms || wantEmail) {
    const guardian = await prisma.guardian.findFirst({ where: { userId: recipientId }, select: { phone: true, email: true, firstName: true } })
    const tag = pupil?.school.shortName || pupil?.school.name || 'School'
    if (wantSms) {
      if (!guardian?.phone) notes.push('SMS: no phone on record')
      else { const d = await sendSms(msg.schoolId, [{ to: guardian.phone, text: `${tag}: ${body}`.slice(0, 480) }]); notes.push(d.delivered ? `SMS sent (${d.segments} segment${d.segments === 1 ? '' : 's'})` : `SMS failed: ${d.results[0]?.error ?? 'not sent'}`) }
    }
    if (wantEmail) {
      const to = guardian?.email
      if (!to) notes.push('Email: no address on record')
      else { const d = await sendEmailBroadcast(msg.schoolId, [{ to, label: guardian?.firstName ?? '' }], `Message about ${msg.student.firstName} ${msg.student.lastName} — ${tag}`, body, session.user.name ?? tag); notes.push(d.delivered ? 'Email sent' : `Email failed: ${d.results[0]?.error ?? 'not sent'}`) }
    }
    await prisma.message.update({ where: { id: msg.id }, data: { delivery: notes.join(' · ') } })
  }
  await prisma.notification.create({ data: { userId: recipientId, title: `Message from ${session.user.name ?? 'the school'}`, message: `About ${msg.student.firstName} ${msg.student.lastName}: ${body.slice(0, 140)}` } })
  await record(session, { action: 'create', entity: 'Message', entityId: msg.id, summary: `Sent a message about ${msg.student.firstName} ${msg.student.lastName}${notes.length ? ` (${notes.join('; ')})` : ''}` })
  return NextResponse.json({ message: { id: msg.id, body: msg.body, createdAt: msg.createdAt, mine: true, viaSms: wantSms, viaEmail: wantEmail, delivery: notes.join(' · ') || null } })
}
