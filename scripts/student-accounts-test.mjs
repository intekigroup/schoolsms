// Student login provisioning from the students screen.
//   node scripts/student-accounts-test.mjs [baseUrl]

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
  const r = await fetch(`${B}/api/auth/callback/credentials`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }), redirect: 'manual',
  })
  keep(r)
  const out = cookie()
  return out.includes('session-token') ? out : null
}

const admin = await login('admin@kilimanjaro.tz', 'admin123')
const parent = await login('parent@kilimanjaro.tz', 'parent123')
const school = await prisma.school.findFirst()

// A throwaway student, so no seeded pupil is left with a stray login.
await prisma.student.deleteMany({ where: { admissionNo: 'ACCT-FIXTURE' } })
const cls = await prisma.class.findFirst({ where: { schoolId: school.id } })
const student = await prisma.student.create({
  data: {
    firstName: 'Provision', lastName: 'Fixture', gender: 'FEMALE',
    dateOfBirth: new Date('2011-05-05'), admissionNo: 'ACCT-FIXTURE',
    schoolId: school.id, classId: cls.id,
  },
})

const api = async (method, path, body, cookie = admin) => {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null; try { json = await r.json() } catch {}
  return { status: r.status, json }
}

console.log('== CREATING A LOGIN ==')
const created = await api('POST', '/api/students/account', { studentId: student.id })
ck('office can create a login', created.status, 200)
ck('email derived from admission number', created.json?.email, 'acct-fixture@students.local')
ck('temporary password returned once', typeof created.json?.password === 'string' && created.json.password.length >= 8, true)
console.log(`        ${created.json?.email} / ${created.json?.password}`)

const linked = await prisma.student.findUnique({ where: { id: student.id }, select: { userId: true } })
ck('student record linked', Boolean(linked.userId), true)
const account = await prisma.user.findUnique({ where: { id: linked.userId } })
ck('role is STUDENT', account.role, 'STUDENT')
ck('verified (office vouched in person)', Boolean(account.emailVerified), true)
ck('password stored hashed', account.hashedPassword !== created.json.password, true)
ck('password actually works', await bcrypt.compare(created.json.password, account.hashedPassword), true)

console.log('== THE STUDENT CAN USE IT ==')
const sc = await login(created.json.email, created.json.password)
ck('student signs in', Boolean(sc), true)
const landing = await fetch(`${B}/dashboard`, { headers: { Cookie: sc }, redirect: 'manual' })
ck('lands on their own records', (landing.headers.get('location') ?? '').replace(B, ''), '/dashboard/my')
const portal = await fetch(`${B}/dashboard/my`, { headers: { Cookie: sc } })
const html = await portal.text()
ck('portal shows their name', html.includes('Provision'), true)
ck('still locked out of the roster', (await fetch(`${B}/api/students`, { headers: { Cookie: sc } })).status, 403)

console.log('== GUARDS ==')
ck('cannot create a second login', (await api('POST', '/api/students/account', { studentId: student.id })).status, 409)
ck('a parent cannot provision logins', (await api('POST', '/api/students/account', { studentId: student.id }, parent)).status, 403)
ck('anonymous cannot provision logins', (await api('POST', '/api/students/account', { studentId: student.id }, '')).status, 401)
ck('unknown student rejected', (await api('POST', '/api/students/account', { studentId: 'nope' })).status, 404)

console.log('== AUDIT ==')
const entry = await prisma.auditLog.findFirst({ where: { entity: 'StudentLogin', action: 'create' }, orderBy: { createdAt: 'desc' } })
ck('creation is audited', /Created a student login/.test(entry?.summary ?? ''), true)
ck('names the actor', entry?.actorName, 'Dr. Joseph Mwalimu')

console.log('== REMOVING A LOGIN ==')
const removed = await api('DELETE', `/api/students/account?studentId=${student.id}`)
ck('office can remove it', removed.status, 200)
const after = await prisma.student.findUnique({ where: { id: student.id }, select: { userId: true } })
ck('student unlinked', after.userId, null)
const disabled = await prisma.user.findUnique({ where: { id: linked.userId } })
ck('account deactivated, not deleted', disabled.isActive, false)
ck('tokenVersion bumped (sessions ended)', disabled.tokenVersion > account.tokenVersion, true)
ck('the old session is dead', (await fetch(`${B}/api/notifications`, { headers: { Cookie: sc } })).status !== 200, true)
ck('cannot sign in again', await login(created.json.email, created.json.password), null)
ck('removing twice is refused', (await api('DELETE', `/api/students/account?studentId=${student.id}`)).status, 409)
ck('removal is audited', /Removed the student login/.test(
  (await prisma.auditLog.findFirst({ where: { entity: 'StudentLogin', action: 'delete' }, orderBy: { createdAt: 'desc' } }))?.summary ?? ''), true)

// Cleanup.
await prisma.user.deleteMany({ where: { id: linked.userId } })
await prisma.student.deleteMany({ where: { id: student.id } })

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
