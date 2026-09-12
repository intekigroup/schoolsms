// Guardian records: create, edit, link to siblings, unlink, delete.
//   node scripts/guardian-crud-test.mjs [baseUrl]

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
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

const api = async (method, path, body, cookie = admin) => {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null; try { json = await r.json() } catch {}
  return { status: r.status, json }
}

// Two siblings, so the link/unlink path is exercised realistically.
const [older, younger] = await prisma.student.findMany({ where: { schoolId: school.id }, take: 2, select: { id: true, firstName: true, lastName: true } })
const before = await prisma.guardian.count()

console.log('== ENROLLING A GUARDIAN ==')
const created = await api('POST', '/api/guardians', {
  firstName: 'Mariam', lastName: 'Crudtest', phone: '+255744000111',
  email: 'mariam.crudtest@example.tz', relationship: 'Mother', occupation: 'Nurse',
  studentId: older.id, isPrimary: true,
})
ck('office can add a guardian', created.status, 200)
const gid = created.json?.id
ck('attached to the pupil', await prisma.studentGuardian.count({ where: { guardianId: gid, studentId: older.id } }), 1)
ck('marked primary', (await prisma.studentGuardian.findFirst({ where: { guardianId: gid } }))?.isPrimary, true)
ck('guardian count grew by one', await prisma.guardian.count(), before + 1)

console.log('== VALIDATION ==')
ck('name required', (await api('POST', '/api/guardians', { lastName: 'X', phone: '+255700000000', studentId: older.id })).status, 400)
ck('phone required', (await api('POST', '/api/guardians', { firstName: 'A', lastName: 'B', studentId: older.id })).status, 400)
const noPupil = await api('POST', '/api/guardians', { firstName: 'A', lastName: 'B', phone: '+255700000000' })
ck('a pupil must be chosen', noPupil.status, 400)
ck('message explains why', /pupil/i.test(noPupil.json?.error ?? ''), true)
ck('bad email rejected', (await api('POST', '/api/guardians', { firstName: 'A', lastName: 'B', phone: '+255700000000', email: 'nope', studentId: older.id })).status, 400)
ck('unknown pupil rejected', (await api('POST', '/api/guardians', { firstName: 'A', lastName: 'B', phone: '+255700000000', studentId: 'nope' })).status, 404)

console.log('== EDITING ==')
const edited = await api('PATCH', '/api/guardians', { id: gid, phone: '+255744999888', occupation: 'Midwife' })
ck('details can be edited', edited.status, 200)
const fresh = await prisma.guardian.findUnique({ where: { id: gid } })
ck('phone saved', fresh.phone, '+255744999888')
ck('occupation saved', fresh.occupation, 'Midwife')
ck('untouched fields kept', fresh.firstName, 'Mariam')

console.log('== SIBLINGS ==')
const linked = await api('POST', '/api/guardians/link', { guardianId: gid, studentId: younger.id })
ck('can link a second pupil', linked.status, 200)
ck('now covers two pupils', await prisma.studentGuardian.count({ where: { guardianId: gid } }), 2)
ck('linking twice refused', (await api('POST', '/api/guardians/link', { guardianId: gid, studentId: younger.id })).status, 409)
ck('can unlink one', (await api('DELETE', `/api/guardians/link?guardianId=${gid}&studentId=${younger.id}`)).status, 200)
ck('back to one pupil', await prisma.studentGuardian.count({ where: { guardianId: gid } }), 1)
const lastOne = await api('DELETE', `/api/guardians/link?guardianId=${gid}&studentId=${older.id}`)
ck('cannot unlink the last pupil', lastOne.status, 409)
ck('message says what to do instead', /only pupil/i.test(lastOne.json?.error ?? ''), true)

console.log('== GUARDS ==')
ck('a parent cannot add guardians', (await api('POST', '/api/guardians', { firstName: 'A', lastName: 'B', phone: '+255700000000', studentId: older.id }, parent)).status, 403)
ck('a parent cannot edit', (await api('PATCH', '/api/guardians', { id: gid, phone: '+255700000000' }, parent)).status, 403)
ck('a parent cannot delete', (await api('DELETE', `/api/guardians?id=${gid}`, undefined, parent)).status, 403)
ck('anonymous rejected', (await api('POST', '/api/guardians', {}, '')).status, 401)
// A guardian with no child in this school must be invisible.
const outsider = await prisma.guardian.create({ data: { id: 'guard-crud-outsider', firstName: 'Out', lastName: 'Sider', phone: '+255700000001' } })
ck('cross-school guardian is a 404', (await api('PATCH', '/api/guardians', { id: outsider.id, phone: '+255700000002' })).status, 404)
const list = await api('GET', '/api/guardians')
ck('directory excludes them', list.json?.some((g) => g.id === outsider.id), false)

console.log('== DELETING ==')
// A login must be removed deliberately before the record can go.
await api('POST', '/api/guardians/account', { guardianId: gid })
const withLogin = await api('DELETE', `/api/guardians?id=${gid}`)
ck('refused while a login exists', withLogin.status, 409)
ck('message says remove the login first', /remove the login first/i.test(withLogin.json?.error ?? ''), true)
await api('DELETE', `/api/guardians/account?guardianId=${gid}`)
const gone = await api('DELETE', `/api/guardians?id=${gid}`)
ck('deletes once the login is gone', gone.status, 200)
ck('links cascaded away', await prisma.studentGuardian.count({ where: { guardianId: gid } }), 0)
// The cross-school outsider fixture is still present at this point.
ck('guardian count back to start', (await prisma.guardian.count()) - 1, before)

console.log('== AUDIT ==')
const entries = await prisma.auditLog.findMany({ where: { entity: 'Guardian' }, orderBy: { createdAt: 'desc' }, take: 6 })
ck('creation audited', entries.some((e) => /Added guardian/.test(e.summary)), true)
ck('edit audited', entries.some((e) => /Updated guardian/.test(e.summary)), true)
ck('linking audited', entries.some((e) => /Linked guardian/.test(e.summary)), true)
ck('deletion audited', entries.some((e) => /Deleted guardian/.test(e.summary)), true)

// Cleanup.
await prisma.user.deleteMany({ where: { email: 'mariam.crudtest@example.tz' } })
await prisma.guardian.deleteMany({ where: { id: 'guard-crud-outsider' } })

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
