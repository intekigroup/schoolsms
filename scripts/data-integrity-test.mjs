// Verifies the student-history protection and the parent-portal access rules.
//   node scripts/data-integrity-test.mjs [baseUrl]

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
const school = await prisma.school.findFirst()
const cls = await prisma.class.findFirst({ where: { schoolId: school.id } })

console.log('== STUDENT HISTORY IS PROTECTED ==')
// A throwaway student who has each kind of history in turn.
await prisma.student.deleteMany({ where: { admissionNo: 'INTEGRITY-FIXTURE' } })
const s = await prisma.student.create({
  data: { firstName: 'Integrity', lastName: 'Fixture', gender: 'MALE', dateOfBirth: new Date('2012-01-01'), admissionNo: 'INTEGRITY-FIXTURE', schoolId: school.id, classId: cls.id },
})

const del = () => fetch(`${B}/api/students?id=${s.id}`, { method: 'DELETE', headers: { Cookie: admin } })

// With no history at all, deletion is allowed.
let r = await del()
ck('deletable with no history', r.status, 200)

// Recreate and give it an attendance record.
const s2 = await prisma.student.create({
  data: { firstName: 'Integrity', lastName: 'Fixture', gender: 'MALE', dateOfBirth: new Date('2012-01-01'), admissionNo: 'INTEGRITY-FIXTURE', schoolId: school.id, classId: cls.id },
})
await prisma.attendance.create({ data: { studentId: s2.id, classId: cls.id, date: new Date('2026-02-02'), status: 'PRESENT' } })
r = await fetch(`${B}/api/students?id=${s2.id}`, { method: 'DELETE', headers: { Cookie: admin } })
let body = await r.json()
ck('blocked by attendance', r.status, 409)
ck('message names attendance', /attendance record/.test(body.error ?? ''), true)
console.log(`        "${body.error}"`)
ck('student still exists', Boolean(await prisma.student.findUnique({ where: { id: s2.id } })), true)
ck('attendance survived', await prisma.attendance.count({ where: { studentId: s2.id } }), 1)

// Add a fee payment too; the message should list both.
const fee = await prisma.feeStructure.create({ data: { name: 'Integrity Fee', amount: 1000, schoolId: school.id } })
await prisma.feePayment.create({ data: { studentId: s2.id, schoolId: s2.schoolId, feeStructureId: fee.id, amount: 1000, receiptNo: `RCP-INTEG-${Date.now()}` } })
r = await fetch(`${B}/api/students?id=${s2.id}`, { method: 'DELETE', headers: { Cookie: admin } })
body = await r.json()
ck('message names fee payments too', /fee payment/.test(body.error ?? ''), true)
console.log(`        "${body.error}"`)

// The database itself must refuse, not just the route.
let dbRefused = false
try { await prisma.student.delete({ where: { id: s2.id } }) } catch (e) { dbRefused = e.code === 'P2003' }
ck('DB constraint refuses direct delete', dbRefused, true)

// The supported path: change status instead.
const patch = await fetch(`${B}/api/students`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: admin },
  body: JSON.stringify({ id: s2.id, status: 'GRADUATED' }),
})
ck('status change works instead', patch.status, 200)
ck('status persisted', (await prisma.student.findUnique({ where: { id: s2.id } })).status, 'GRADUATED')

// Clean up the fixture and its history.
await prisma.feePayment.deleteMany({ where: { studentId: s2.id } })
await prisma.feeStructure.delete({ where: { id: fee.id } })
await prisma.attendance.deleteMany({ where: { studentId: s2.id } })
await prisma.student.delete({ where: { id: s2.id } })

console.log('== PARENT PORTAL ACCESS ==')
async function pageFor(role, email) {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.user.create({ data: { email, name: `${role} probe`, role, schoolId: school.id, emailVerified: new Date(), hashedPassword: await bcrypt.hash('probepass123', 12) } })
  const c = await login(email, 'probepass123')
  const res = await fetch(`${B}/dashboard/parents`, { headers: { Cookie: c }, redirect: 'manual' })
  const html = res.status === 200 ? await res.text() : ''
  await prisma.user.deleteMany({ where: { email } })
  return { status: res.status, showsDirectory: /Guardians Directory/i.test(html) }
}

const student = await pageFor('STUDENT', 'probe-student@kilimanjaro.tz')
ck('STUDENT redirected away', student.status !== 200, true)
ck('STUDENT sees no directory', student.showsDirectory, false)

const librarian = await pageFor('LIBRARIAN', 'probe-librarian@kilimanjaro.tz')
ck('LIBRARIAN redirected away', librarian.status !== 200, true)

const accountant = await pageFor('ACCOUNTANT', 'probe-accountant@kilimanjaro.tz')
ck('ACCOUNTANT redirected away', accountant.status !== 200, true)

const teacher = await pageFor('TEACHER', 'probe-teacher@kilimanjaro.tz')
ck('TEACHER still allowed', teacher.status, 200)

const parentCookie = await login('parent@kilimanjaro.tz', 'parent123')
const parentRes = await fetch(`${B}/dashboard/parents`, { headers: { Cookie: parentCookie } })
const parentHtml = await parentRes.text()
ck('PARENT still sees own children', parentRes.status === 200 && /Baraka|Chiku/.test(parentHtml), true)

const adminRes = await fetch(`${B}/dashboard/parents`, { headers: { Cookie: admin } })
ck('SCHOOL_ADMIN still allowed', adminRes.status, 200)

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
