// Messaging channels: direct messages pushed as SMS / email, and the office email broadcast.
//   node scripts/messaging-channels-test.mjs [baseUrl]

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('../node_modules/bcryptjs')
const prisma = new PrismaClient()
const B = process.argv[2] ?? 'http://127.0.0.1:3000'

let pass = 0, fail = 0
function ck(label, actual, expected) {
  const ok = String(actual) === String(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${actual}${ok ? '' : ` (want ${expected})`}`)
  ok ? pass++ : fail++
}
async function login(email, password) {
  const jar = new Map()
  const keep = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const [p] = c.split(';'); const i = p.indexOf('='); jar.set(p.slice(0, i), p.slice(i + 1)) } }
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const cr = await fetch(`${B}/api/auth/csrf`); keep(cr)
  const { csrfToken } = await cr.json()
  const r = await fetch(`${B}/api/auth/callback/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }), redirect: 'manual' })
  keep(r); const out = cookie(); return out.includes('session-token') ? out : null
}
const api = async (path, cookie, init = {}) => {
  const r = await fetch(B + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) }, redirect: 'manual' })
  const type = r.headers.get('content-type') ?? ''
  return { status: r.status, body: type.includes('json') ? await r.json().catch(() => ({})) : await r.text() }
}

const TAG = 'MCT'
const K = 'school-kilimanjaro'
// RFC 2606 reserved TLD: the relay refuses it, so nothing real is ever sent by this suite.
const MAMA_EMAIL = `mama.${TAG.toLowerCase()}@example.invalid`
async function cleanup() {
  const users = (await prisma.user.findMany({ where: { email: { endsWith: `.${TAG.toLowerCase()}@x.tz` } }, select: { id: true } })).map((u) => u.id)
  if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } }); await prisma.notification.deleteMany({ where: { userId: { in: users } } }); await prisma.message.deleteMany({ where: { OR: [{ senderId: { in: users } }, { recipientId: { in: users } }] } }) }
  const students = (await prisma.student.findMany({ where: { admissionNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)
  if (students.length) { await prisma.message.deleteMany({ where: { studentId: { in: students } } }); await prisma.studentGuardian.deleteMany({ where: { studentId: { in: students } } }); await prisma.student.deleteMany({ where: { id: { in: students } } }) }
  await prisma.guardian.deleteMany({ where: { lastName: `Guardian${TAG}` } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.class.deleteMany({ where: { name: { endsWith: ` ${TAG}` } } })
  await prisma.smsLog.deleteMany({ where: { schoolId: K, OR: [{ phone: MAMA_EMAIL }, { phone: `one.${TAG.toLowerCase()}@example.invalid` }, { message: { contains: TAG } }] } })
}
await cleanup()

const pw = await bcrypt.hash('pass1234', 10)
const cls = await prisma.class.create({ data: { name: `Std 2 ${TAG}`, level: 'PRIMARY', schoolId: K } })
const pupil = await prisma.student.create({ data: { admissionNo: `${TAG}-1`, firstName: 'Juma', lastName: 'Kid', gender: 'MALE', dateOfBirth: new Date('2016-01-01'), schoolId: K, classId: cls.id } })
const pupil2 = await prisma.student.create({ data: { admissionNo: `${TAG}-2`, firstName: 'Asha', lastName: 'Kid', gender: 'FEMALE', dateOfBirth: new Date('2016-01-01'), schoolId: K, classId: cls.id } })
const mamaUser = await prisma.user.create({ data: { email: `mama.${TAG.toLowerCase()}@x.tz`, name: 'Mama MCT', role: 'PARENT', hashedPassword: pw, schoolId: K, emailVerified: new Date() } })
await prisma.guardian.create({ data: { firstName: 'Mama', lastName: `Guardian${TAG}`, phone: '+255700000555', email: MAMA_EMAIL, userId: mamaUser.id, students: { create: [{ studentId: pupil.id, isPrimary: true }] } } })
await prisma.guardian.create({ data: { firstName: 'Baba', lastName: `Guardian${TAG}`, phone: '+255700000556', students: { create: [{ studentId: pupil2.id, isPrimary: true }] } } }) // no email
const admin = await login('admin@kilimanjaro.tz', 'admin123')
const mama = await login(`mama.${TAG.toLowerCase()}@x.tz`, 'pass1234')
ck('logins', !!(admin && mama), true)

console.log('\n# Direct message with SMS + email')
let r = await api('/api/messages', admin, { method: 'POST', body: JSON.stringify({ studentId: pupil.id, recipientId: mamaUser.id, body: `Juma forgot his book ${TAG}`, sms: true, email: true }) })
ck('office sends with both channels', r.status, 200); ck('  flags echoed', `${r.body.message.viaSms} ${r.body.message.viaEmail}`, 'true true')
ck('  delivery note mentions both channels', /SMS/.test(r.body.message.delivery) && /Email/.test(r.body.message.delivery), true)
const stored = await prisma.message.findUnique({ where: { id: r.body.message.id } }); ck('  stored flags', `${stored.viaSms} ${stored.viaEmail}`, 'true true'); ck('  stored delivery note', !!stored.delivery, true)
ck('  SMS logged for the guardian\'s number', await prisma.smsLog.count({ where: { schoolId: K, channel: 'sms', phone: { contains: '255700000555' }, message: { contains: TAG } } }) >= 1, true)
ck('  email logged for the guardian\'s address', await prisma.smsLog.count({ where: { schoolId: K, channel: 'email', phone: MAMA_EMAIL } }) >= 1, true)
r = await api(`/api/messages?with=${mamaUser.id}&studentId=${pupil.id}`, admin); ck('thread carries channel flags', `${r.body.messages[0].viaSms} ${r.body.messages[0].viaEmail}`, 'true true')
r = await api('/api/messages', mama, { method: 'POST', body: JSON.stringify({ studentId: pupil.id, recipientId: (await prisma.user.findUnique({ where: { email: 'admin@kilimanjaro.tz' } })).id, body: 'Asante', sms: true, email: true }) })
ck('a guardian\'s reply ignores the channel flags', `${r.status} ${r.body.message.viaSms} ${r.body.message.viaEmail}`, '200 false false')
r = await api('/api/messages', admin, { method: 'POST', body: JSON.stringify({ studentId: pupil.id, recipientId: mamaUser.id, body: 'plain' }) }); ck('plain message has no delivery note', `${r.status} ${r.body.message.delivery}`, '200 null')

console.log('\n# Email broadcast')
r = await api('/api/email', admin); ck('GET /api/email', r.status, 200); ck('  reports whether mail is configured', typeof r.body.configured, 'boolean')
r = await api('/api/email', admin, { method: 'PATCH', body: JSON.stringify({ subject: 'x', text: 'x', audience: 'class-guardians', classId: cls.id }) })
ck('preview class audience', r.status, 200); ck('  1 with address, 1 missing', `${r.body.recipients} ${r.body.missing}`, '1 1')
r = await api('/api/email', admin, { method: 'POST', body: JSON.stringify({ subject: `Closing day ${TAG}`, text: 'School closes on Friday.', audience: 'class-guardians', classId: cls.id }) })
ck('send to class', r.status, 200); ck('  requested 1, missing 1', `${r.body.requested} ${r.body.missing}`, '1 1')
ck('  logged with subject', await prisma.smsLog.count({ where: { schoolId: K, channel: 'email', subject: `Closing day ${TAG}` } }), 1)
r = await api('/api/email', admin, { method: 'POST', body: JSON.stringify({ subject: `Hi ${TAG}`, text: 'hello', audience: 'one', email: `one.${TAG.toLowerCase()}@example.invalid` }) }); ck('send to one address', r.status, 200)
r = await api('/api/email', admin, { method: 'POST', body: JSON.stringify({ subject: 'x', text: 'x', audience: 'class-guardians' }) }); ck('class audience without class -> 400', r.status, 400)
r = await api('/api/email', admin, { method: 'POST', body: JSON.stringify({ subject: 'x', text: 'x', audience: 'class-guardians', classId: 'nope' }) }); ck('unknown class -> 400', r.status, 400)
r = await api('/api/email', mama, { method: 'POST', body: JSON.stringify({ subject: 'x', text: 'xx', audience: 'all-guardians' }) }); ck('a guardian cannot broadcast', r.status, 403)
const teacherRow = await prisma.user.findFirst({ where: { schoolId: K, role: 'TEACHER', email: { endsWith: '@kilimanjaro.tz' } } })
if (teacherRow) { const t = await login(teacherRow.email, 'teacher123'); if (t) { r = await api('/api/email', t, { method: 'POST', body: JSON.stringify({ subject: 'x', text: 'xx', audience: 'all-guardians' }) }); ck('a teacher cannot broadcast by default', r.status, 403) } }

await cleanup()
console.log(`\n${pass} passed, ${fail} failed`)
await prisma.$disconnect()
process.exit(fail ? 1 : 0)
