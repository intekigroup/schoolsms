export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
import { sendMail, mailFrom, mailTransport } from '@/lib/mailer'

/**
 * Marketing contact form. Public, so it is throttled per sender address and
 * never leaks whether delivery is configured beyond an honest `delivered` flag.
 * With no mail provider the message is written to the server log — visible to
 * the operator, and the form says so.
 */
const Schema = z.object({
  name: z.string({ required_error: 'Your name is required' }).trim().min(2, 'Your name is required').max(100),
  email: z.string({ required_error: 'An email address is required' }).trim().toLowerCase().email('Enter a valid email address').max(255),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  school: z.string({ required_error: 'Tell us the school' }).trim().min(2, 'Tell us the school').max(150),
  pupils: z.union([z.string(), z.number()]).optional().transform((v) => {
    const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }),
  topic: z.enum(['quote', 'demo', 'pricing', 'standalone', 'enterprise', 'support', 'other']).default('other'),
  levels: z.array(z.enum(['NURSERY', 'PRIMARY', 'O_LEVEL', 'A_LEVEL'])).max(4).optional().default([]),
  message: z.string({ required_error: 'Write a message' }).trim().min(10, 'A little more detail helps us reply properly').max(4000),
  // Honeypot: real people never see this field.
  website: z.string().optional(),
})

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the form and try again' }, { status: 400 })
  }
  const d = parsed.data

  // Bots fill every field; quietly accept and drop.
  if (d.website) return NextResponse.json({ ok: true, delivered: false })

  const limited = rateLimit(req, 'auth', d.email)
  if (limited) return limited

  const to = process.env.CONTACT_EMAIL || mailFrom().replace(/^.*<([^>]+)>.*$/, '$1')
  const lines = [
    `Topic:   ${d.topic}`,
    `Name:    ${d.name}`,
    `Email:   ${d.email}`,
    `Phone:   ${d.phone || '—'}`,
    `School:  ${d.school}`,
    `Pupils:  ${d.pupils ?? '—'}`,
    `Levels:  ${d.levels.length ? d.levels.join(', ') : '—'}`,
    '',
    d.message,
  ]

  try {
    const result = await sendMail({
      to,
      subject: `[Shule SMS] ${d.topic} — ${d.school}`,
      text: lines.join('\n'),
    })
    return NextResponse.json({
      ok: true,
      delivered: result.delivered,
      transport: mailTransport(),
    })
  } catch (e) {
    console.error('contact form failed:', e)
    return NextResponse.json({ error: 'Could not send your message right now. Please try again shortly.' }, { status: 500 })
  }
}
