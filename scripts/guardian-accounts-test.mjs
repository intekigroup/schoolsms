// Guardian (parent) login provisioning from the guardians directory.
//   node scripts/guardian-accounts-test.mjs [baseUrl]

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
const parentCookie = await login('parent@kilimanjaro.tz', 'parent123')
const school = await prisma.school.findFirst()

const api = async (method, path, body, cookie = admin) => {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null; try { json = await r.json() } catch {}
  return { status: r.status, json }
}

// A throwaway guardian attached to a real student, so no seeded parent is touched.
const student = await prisma.student.findFirst({ where: { schoolId: school.id }, select: { id: true } })
await prisma.guardian.deleteMany({ where: { id: 'guard-acct-fixture' } })
const guardian = await prisma.guardian.create({
  data: {
    id: 'guard-acct-fixture', firstName: 'Neema', lastName: 'Fixture',
    phone: '+255700000000', email: 'neema.fixture@example.tz', relationship: 'Mother',
    students: { create: { studentId: student.id, isPrimary: false } },
  },
})

console.log('== CREATING A PARENT LOGIN ==')
const created = await api('POST', '/api/guardians/account', { guardianId: guardian.id })
ck('office can create a login', created.status, 200)
ck('uses the guardian\'s own email', created.json?.email, 'neema.fixture@example.tz')
ck('temporary password returned once', typeof created.json?.password === 'string' && created.json.password.length >= 8, true)
console.log(`        ${created.json?.email} / ${created.json?.password}`)

const linked = await prisma.guardian.findUnique({ where: { id: guardian.id }, select: { userId: true } })
ck('guardian record linked', Boolean(linked.userId), true)
const account = await prisma.user.findUnique({ where: { id: linked.userId } })
ck('role is PARENT', account.role, 'PARENT')
ck('verified (issued in person)', Boolean(account.emailVerified), true)
ck('password works against the hash', await bcrypt.compare(created.json.password, account.hashedPassword), true)

console.log('== THE PARENT CAN USE IT ==')
const pc = await login(created.json.email, created.json.password)
ck('parent signs in', Boolean(pc), true)
const landing = await fetch(`${B}/dashboard`, { headers: { Cookie: pc }, redirect: 'manual' })
ck('lands on the parent portal', (landing.headers.get('location') ?? '').replace(B, ''), '/dashboard/parents')
const portal = await fetch(`${B}/dashboard/parents`, { headers: { Cookie: pc } })
const html = await portal.text()
ck('portal opens', portal.status, 200)
ck('sees the child view, not the staff directory', /Guardians Directory/.test(html), false)
ck('cannot write', (await api('POST', '/api/students', { firstName: 'x', lastName: 'y', admissionNo: 'z' }, pc)).status, 403)

console.log('== GUARDS ==')
ck('cannot create a second login', (await api('POST', '/api/guardians/account', { guardianId: guardian.id })).status, 409)
ck('a parent cannot provision logins', (await api('POST', '/api/guardians/account', { guardianId: guardian.id }, parentCookie)).status, 403)
ck('anonymous cannot provision logins', (await api('POST', '/api/guardians/account', { guardianId: guardian.id }, '')).status, 401)
ck('unknown guardian rejected', (await api('POST', '/api/guardians/account', { guardianId: 'nope' })).status, 404)

// A guardian with no children in this school must not be reachable.
const outsider = await prisma.guardian.create({
  data: { id: 'guard-outsider-fixture', firstName: 'Out', lastName: 'Sider', phone: '+255711111111', email: 'out@example.tz' },
})
ck('guardian outside the school rejected', (await api('POST', '/api/guardians/account', { guardianId: outsider.id })).status, 404)

// No email on record and none supplied.
const noEmail = await prisma.guardian.create({
  data: {
    id: 'guard-noemail-fixture', firstName: 'No', lastName: 'Email', phone: '+255722222222',
    students: { create: { studentId: student.id, isPrimary: false } },
  },
})
const missing = await api('POST', '/api/guardians/account', { guardianId: noEmail.id })
ck('missing email explained, not crashed', missing.status, 400)
ck('message says what to do', /no email address on record/i.test(missing.json?.error ?? ''), true)
const supplied = await api('POST', '/api/guardians/account', { guardianId: noEmail.id, email: 'supplied@example.tz' })
ck('an address can be supplied instead', supplied.status, 200)

console.log('== AUDIT ==')
const entry = await prisma.auditLog.findFirst({ where: { entity: 'GuardianLogin', action: 'create' }, orderBy: { createdAt: 'desc' } })
ck('creation is audited', /Created a parent login/.test(entry?.summary ?? ''), true)
ck('names the actor', entry?.actorName, 'Dr. Joseph Mwalimu')

console.log('== REMOVING A LOGIN ==')
const removed = await api('DELETE', `/api/guardians/account?guardianId=${guardian.id}`)
ck('office can remove it', removed.status, 200)
ck('guardian unlinked', (await prisma.guardian.findUnique({ where: { id: guardian.id }, select: { userId: true } })).userId, null)
const disabled = await prisma.user.findUnique({ where: { id: linked.userId } })
ck('account deactivated, not deleted', disabled.isActive, false)
ck('the old session is dead', (await fetch(`${B}/api/notifications`, { headers: { Cookie: pc } })).status !== 200, true)
ck('cannot sign in again', await login(created.json.email, created.json.password), null)
ck('removing twice is refused', (await api('DELETE', `/api/guardians/account?guardianId=${guardian.id}`)).status, 409)

console.log('== THE DEMO PARENT IS UNTOUCHED ==')
ck('seeded parent still signs in', Boolean(await login('parent@kilimanjaro.tz', 'parent123')), true)

// Cleanup.
const fixtureIds = ['guard-acct-fixture', 'guard-outsider-fixture', 'guard-noemail-fixture']
const users = await prisma.user.findMany({ where: { email: { in: ['neema.fixture@example.tz', 'supplied@example.tz'] } }, select: { id: true } })
await prisma.studentGuardian.deleteMany({ where: { guardianId: { in: fixtureIds } } })
await prisma.guardian.deleteMany({ where: { id: { in: fixtureIds } } })
await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
