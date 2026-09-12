// Subscription enforcement and per-tenant backup/restore.
//   node scripts/saas-enforcement-test.mjs [baseUrl]

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
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

const api = async (method, path, body, cookie) => {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null; try { json = await r.json() } catch {}
  return { status: r.status, json }
}

const SUFFIX = Date.now()
const A = await prisma.school.findFirst({ where: { name: 'Kilimanjaro Academy' } })
const adminA = await login('admin@kilimanjaro.tz', 'admin123')
const superAdmin = await login('super@shulesms.tz', 'super123')

// A tenant we can suspend without disturbing the demo school.
const T = await prisma.school.create({
  data: { name: `Enforce School ${SUFFIX}`, subscription: { create: { plan: 'BASIC', maxStudents: 300, maxStaff: 40 } } },
})
await prisma.user.create({
  data: {
    email: `enforce-${SUFFIX}@audit.tz`, name: 'Enforce Admin', role: 'SCHOOL_ADMIN', schoolId: T.id,
    emailVerified: new Date(), hashedPassword: await bcrypt.hash('enforce12345', 12),
  },
})
const tClass = await prisma.class.create({ data: { name: 'E Class', level: 'PRIMARY', capacity: 20, schoolId: T.id } })
await prisma.student.create({
  data: { firstName: 'Enf', lastName: 'Pupil', gender: 'MALE', dateOfBirth: new Date('2012-01-01'), admissionNo: `E-${SUFFIX}`, schoolId: T.id, classId: tClass.id },
})
const setStatus = (status) => api('PATCH', '/api/schools', { schoolId: T.id, status }, superAdmin)
const setActive = (isActive) => api('PATCH', '/api/schools', { schoolId: T.id, isActive }, superAdmin)

console.log('== ACTIVE: everything works ==')
let cookie = await login(`enforce-${SUFFIX}@audit.tz`, 'enforce12345')
ck('can sign in', Boolean(cookie), true)
ck('can read', (await api('GET', '/api/students', undefined, cookie)).status, 200)
const okWrite = await api('POST', '/api/students', { firstName: 'A', lastName: 'B', admissionNo: `OK-${SUFFIX}` }, cookie)
ck('can write', okWrite.status, 200)
if (okWrite.json?.id) await prisma.student.delete({ where: { id: okWrite.json.id } })

console.log('== SUSPENDED: read-only, immediately, on the existing session ==')
await setStatus('SUSPENDED')
// No new login — the live session must degrade on its very next request.
const readWhileSuspended = await api('GET', '/api/students', undefined, cookie)
ck('reads still work', readWhileSuspended.status, 200)
ck('and still return their data', readWhileSuspended.json?.length >= 1, true)
const writeSuspended = await api('POST', '/api/students', { firstName: 'X', lastName: 'Y', admissionNo: `SUS-${SUFFIX}` }, cookie)
ck('writes are refused', writeSuspended.status, 402)
ck('response is flagged read-only', writeSuspended.json?.readOnly, true)
ck('message names the status', /suspended/i.test(writeSuspended.json?.error ?? ''), true)
console.log(`        "${writeSuspended.json?.error}"`)
ck('nothing was created', await prisma.student.count({ where: { admissionNo: `SUS-${SUFFIX}` } }), 0)
ck('edits refused too', (await api('PATCH', '/api/classes', { id: tClass.id, capacity: 99 }, cookie)).status, 402)
ck('deletes refused too', (await api('DELETE', `/api/classes?id=${tClass.id}`, undefined, cookie)).status, 402)
ck('SMS refused', (await api('POST', '/api/sms', { audience: 'all-guardians', text: 'x' }, cookie)).status, 402)
ck('a fresh login is still allowed', Boolean(await login(`enforce-${SUFFIX}@audit.tz`, 'enforce12345')), true)

console.log('== EXPIRED and CANCELLED behave the same ==')
await setStatus('EXPIRED')
ck('EXPIRED blocks writes', (await api('POST', '/api/students', { firstName: 'X', lastName: 'Y', admissionNo: `EXP-${SUFFIX}` }, cookie)).status, 402)
await setStatus('CANCELLED')
ck('CANCELLED blocks writes', (await api('POST', '/api/students', { firstName: 'X', lastName: 'Y', admissionNo: `CAN-${SUFFIX}` }, cookie)).status, 402)

console.log('== REACTIVATING RESTORES WRITES ==')
await setStatus('ACTIVE')
const backOn = await api('POST', '/api/students', { firstName: 'Back', lastName: 'On', admissionNo: `ON-${SUFFIX}` }, cookie)
ck('writes work again on the same session', backOn.status, 200)
if (backOn.json?.id) await prisma.student.delete({ where: { id: backOn.json.id } })

console.log('== DEACTIVATED SCHOOL: no access at all ==')
await setActive(false)
ck('the live session dies', (await api('GET', '/api/students', undefined, cookie)).status, 401)
ck('and sign-in is refused', await login(`enforce-${SUFFIX}@audit.tz`, 'enforce12345'), null)
await setActive(true)
ck('reactivating restores sign-in', Boolean(await login(`enforce-${SUFFIX}@audit.tz`, 'enforce12345')), true)

console.log('== THE DEMO SCHOOL IS UNAFFECTED THROUGHOUT ==')
ck('school A still writes', (await api('PATCH', '/api/classes', { id: (await prisma.class.findFirst({ where: { schoolId: A.id } })).id, capacity: 41 }, adminA)).status, 200)
ck('super admin is never read-only', (await api('PATCH', '/api/schools', { schoolId: T.id, plan: 'BASIC' }, superAdmin)).status, 200)

console.log('== PER-TENANT BACKUP ==')
const before = {
  tStudents: await prisma.student.count({ where: { schoolId: T.id } }),
  aStudents: await prisma.student.count({ where: { schoolId: A.id } }),
  aGuardians: await prisma.guardian.count(),
}
const out = execFileSync('node', ['scripts/backup-school.mjs', T.id, 'backups'], { encoding: 'utf8' })
const fileLine = out.split('\n').find((l) => l.includes('written to'))
const backupFile = fileLine?.split('written to ')[1]?.trim()
ck('backup produced a file', Boolean(backupFile && fs.existsSync(backupFile)), true)
ck('it is scoped to one school', /school-enforce-school/.test(backupFile ?? ''), true)
const raw = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(backupFile)).toString())
ck('scope recorded', raw.scope, 'school')
ck('contains only this school', raw.tables.School.length, 1)
ck('contains its pupils', raw.tables.Student.length, before.tStudents)
ck('does not contain school A\'s pupils', raw.tables.Student.some((s) => s.schoolId === A.id), false)

console.log('== PER-TENANT RESTORE LEAVES OTHER TENANTS ALONE ==')
// Destroy tenant T entirely, the way a bad migration or a mistake would.
await prisma.student.deleteMany({ where: { schoolId: T.id } })
await prisma.class.deleteMany({ where: { schoolId: T.id } })
ck('tenant T wiped', await prisma.student.count({ where: { schoolId: T.id } }), 0)

execFileSync('node', ['scripts/restore-school.mjs', backupFile, '--yes'], { encoding: 'utf8' })
ck('T\'s pupils restored', await prisma.student.count({ where: { schoolId: T.id } }), before.tStudents)
ck('T\'s classes restored', await prisma.class.count({ where: { schoolId: T.id } }), 1)
ck('school A untouched', await prisma.student.count({ where: { schoolId: A.id } }), before.aStudents)
ck('guardians untouched', await prisma.guardian.count(), before.aGuardians)
ck('restored tenant can still sign in', Boolean(await login(`enforce-${SUFFIX}@audit.tz`, 'enforce12345')), true)

// A platform-wide file must be refused by the per-school restore.
const platformFiles = fs.readdirSync('backups').filter((f) => f.startsWith('shule-'))
if (platformFiles.length) {
  let refused = false
  try { execFileSync('node', ['scripts/restore-school.mjs', `backups/${platformFiles[0]}`, '--yes'], { encoding: 'utf8' }) }
  catch { refused = true }
  ck('refuses a platform-wide backup', refused, true)
}

// Cleanup.
await prisma.auditLog.deleteMany({ where: { schoolId: T.id } })
await prisma.smsLog.deleteMany({ where: { schoolId: T.id } })
await prisma.invoicePayment.deleteMany({ where: { invoice: { schoolId: T.id } } })
await prisma.invoice.deleteMany({ where: { schoolId: T.id } })
await prisma.student.deleteMany({ where: { schoolId: T.id } })
await prisma.class.deleteMany({ where: { schoolId: T.id } })
await prisma.user.deleteMany({ where: { schoolId: T.id } })
await prisma.schoolSubscription.deleteMany({ where: { schoolId: T.id } })
await prisma.school.deleteMany({ where: { id: T.id } })
if (backupFile && fs.existsSync(backupFile)) fs.unlinkSync(backupFile)

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
