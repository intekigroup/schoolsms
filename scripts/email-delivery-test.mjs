// Proves real SMTP delivery end to end: the app sends a password-reset mail to
// a local SMTP sink, and the link captured from that message actually works.
//
// Requires the dev server to be running with:
//   MAIL_TRANSPORT=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_IGNORE_TLS=true
//
//   node scripts/email-delivery-test.mjs [baseUrl]

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('../node_modules/bcryptjs')
const { SMTPServer } = require('../node_modules/smtp-server')
const prisma = new PrismaClient()
const B = process.argv[2] ?? 'http://127.0.0.1:3000'
const SINK_PORT = 2525

let pass = 0, fail = 0
function ck(label, actual, expected) {
  const ok = String(actual) === String(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${actual}${ok ? '' : ` (want ${expected})`}`)
  ok ? pass++ : fail++
}

// ── A throwaway inbox ──────────────────────────────────────────
const inbox = []
const sink = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onData(stream, session, callback) {
    let raw = ''
    stream.on('data', (c) => { raw += c })
    stream.on('end', () => {
      inbox.push({ to: session.envelope.rcptTo.map((r) => r.address), from: session.envelope.mailFrom.address, raw })
      callback()
    })
  },
})
await new Promise((resolve, reject) => {
  sink.listen(SINK_PORT, '127.0.0.1', resolve)
  sink.on('error', reject)
})
console.log(`SMTP sink listening on 127.0.0.1:${SINK_PORT}\n`)

/**
 * Decodes quoted-printable, which is how nodemailer encodes the body: long URLs
 * are split with a soft line break ("=\r\n") and "=" becomes "=3D". Real mail
 * clients do this for the reader; the test has to do it to see the link.
 */
const decodeBody = (raw) =>
  String(raw)
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))

const waitForMail = async (n = 1, ms = 8000) => {
  const until = Date.now() + ms
  while (inbox.length < n && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
  return inbox.length >= n
}

// ── A user to send to ──────────────────────────────────────────
const school = await prisma.school.findFirst()
const EMAIL = 'mail-delivery@kilimanjaro.tz'
await prisma.user.deleteMany({ where: { email: EMAIL } })
const user = await prisma.user.create({
  data: {
    email: EMAIL, name: 'Mail Delivery', role: 'TEACHER', schoolId: school.id,
    emailVerified: new Date(), hashedPassword: await bcrypt.hash('original-pass-1', 12),
  },
})

console.log('== THE APP IS ACTUALLY SENDING ==')
const res = await fetch(`${B}/api/auth/forgot-password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL }),
})
const body = await res.json()
ck('request accepted', res.status, 200)
ck('reports email IS configured', body.emailConfigured, true)

ck('a message reached the SMTP server', await waitForMail(1), true)
const mail = inbox[0]
ck('addressed to the right person', mail?.to?.[0], EMAIL)
ck('sender set from MAIL_FROM', /shulesms/i.test(mail?.from ?? ''), true)
ck('subject is the reset mail', /Subject:.*Reset your Shule SMS password/i.test(mail?.raw ?? ''), true)

// ── The captured link must work ────────────────────────────────
console.log('== THE LINK IN THE EMAIL WORKS ==')
const link = decodeBody(mail?.raw ?? '').match(/https?:\/\/[^\s]*\/reset-password\?token=[A-Za-z0-9_-]+/)?.[0]
ck('mail contains a reset link', Boolean(link), true)
console.log(`        ${link}`)

const token = link?.split('token=')[1]
const page = await fetch(`${B}/reset-password?token=${token}`)
const html = await page.text()
ck('link opens the reset form', /Choose a new password/.test(html), true)

const reset = await fetch(`${B}/api/auth/reset-password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, password: 'delivered-pass-9' }),
})
ck('the emailed token resets the password', reset.status, 200)

// Sign in with the new password to close the loop.
const jar = new Map()
const keep = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const [p] = c.split(';'); const i = p.indexOf('='); jar.set(p.slice(0, i), p.slice(i + 1)) } }
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
const cr = await fetch(`${B}/api/auth/csrf`); keep(cr)
const { csrfToken } = await cr.json()
const li = await fetch(`${B}/api/auth/callback/credentials`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
  body: new URLSearchParams({ csrfToken, email: EMAIL, password: 'delivered-pass-9', callbackUrl: `${B}/dashboard` }),
  redirect: 'manual',
})
keep(li)
ck('sign in with the new password', cookie().includes('session-token'), true)

console.log('== SIGNUP CONFIRMATION IS ALSO DELIVERED ==')
const signupEmail = `mail-signup-${Date.now()}@example.com`
const su = await fetch(`${B}/api/signup`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Mail Signup', email: signupEmail, password: 'signup-pass-123', schoolName: 'Mail Test Academy' }),
})
const suJson = await su.json()
ck('signup accepted', su.status, 200)
ck('signup reports mail configured', suJson.emailConfigured, true)
ck('confirmation message sent', await waitForMail(2), true)
const confirm = inbox[1]
ck('confirmation addressed correctly', confirm?.to?.[0], signupEmail)
const verifyLink = decodeBody(confirm?.raw ?? '').match(/https?:\/\/[^\s]*\/verify-email\?token=[A-Za-z0-9_-]+/)?.[0]
ck('contains a verification link', Boolean(verifyLink), true)

// Confirming the address should let the new account sign in.
const verified = await fetch(verifyLink)
ck('verification page confirms', /Email confirmed/.test(await verified.text()), true)
const newUser = await prisma.user.findUnique({ where: { email: signupEmail } })
ck('account marked verified', Boolean(newUser?.emailVerified), true)

console.log('== FAILURES DO NOT BREAK THE APP ==')
// Point the app at a dead port by stopping the sink mid-flight.
await new Promise((r) => sink.close(r))
const afterDown = await fetch(`${B}/api/auth/forgot-password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL }),
})
ck('still answers 200 when SMTP is down', afterDown.status, 200)
ck('still non-enumerating', (await afterDown.json()).message, 'If that email is registered, a reset link has been sent.')

// Cleanup.
await prisma.user.deleteMany({ where: { email: { in: [EMAIL, signupEmail] } } })
const testSchools = await prisma.school.findMany({ where: { name: 'Mail Test Academy' }, select: { id: true } })
const ids = testSchools.map((s) => s.id)
if (ids.length) {
  await prisma.invoicePayment.deleteMany({ where: { invoice: { schoolId: { in: ids } } } })
  await prisma.invoice.deleteMany({ where: { schoolId: { in: ids } } })
  await prisma.auditLog.deleteMany({ where: { schoolId: { in: ids } } })
  await prisma.schoolSubscription.deleteMany({ where: { schoolId: { in: ids } } })
  await prisma.user.deleteMany({ where: { schoolId: { in: ids } } })
  await prisma.school.deleteMany({ where: { id: { in: ids } } })
}
await prisma.verificationToken.deleteMany({})

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
