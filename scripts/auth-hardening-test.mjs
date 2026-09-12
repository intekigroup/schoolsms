// Tests the auth hardening: JWT session invalidation, account lockout,
// email verification, and subscription plan limits.
//   node scripts/auth-hardening-test.mjs [baseUrl]

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

const B = process.argv[2] ?? 'http://127.0.0.1:3000'
const EMAIL = 'hardening@kilimanjaro.tz'
const PASS = 'initial-pass-123'

let pass = 0, fail = 0
function ck(label, actual, expected) {
  const ok = String(actual) === String(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${actual}${ok ? '' : ` (want ${expected})`}`)
  ok ? pass++ : fail++
}

async function login(email, password) {
  const jar = new Map()
  const keep = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';'); const i = pair.indexOf('=')
      jar.set(pair.slice(0, i), pair.slice(i + 1))
    }
  }
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const csrfRes = await fetch(`${B}/api/auth/csrf`); keep(csrfRes)
  const { csrfToken } = await csrfRes.json()
  const res = await fetch(`${B}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }),
    redirect: 'manual',
  })
  keep(res)
  const out = cookie()
  return out.includes('session-token') ? out : null
}

/** Does this cookie still authenticate? */
async function sessionAlive(cookie) {
  const res = await fetch(`${B}/api/notifications`, { headers: { Cookie: cookie } })
  return res.status === 200
}

const school = await prisma.school.findFirst()
async function makeUser(extra = {}) {
  await prisma.user.deleteMany({ where: { email: EMAIL } })
  return prisma.user.create({
    data: {
      email: EMAIL, name: 'Hardening Test', role: 'TEACHER', schoolId: school.id,
      hashedPassword: await bcrypt.hash(PASS, 12), emailVerified: new Date(), ...extra,
    },
  })
}

console.log('== SESSION INVALIDATION (the JWT limitation) ==')
let user = await makeUser()
const deviceA = await login(EMAIL, PASS)
const deviceB = await login(EMAIL, PASS)
ck('two sessions established', Boolean(deviceA && deviceB), true)
ck('device B alive before reset', await sessionAlive(deviceB), true)

// Device A changes the password; device B must die.
const chg = await fetch(`${B}/api/auth/change-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: deviceA },
  body: JSON.stringify({ currentPassword: PASS, newPassword: 'brand-new-pass-1' }),
})
ck('password changed', chg.status, 200)
ck('tokenVersion bumped', (await prisma.user.findUnique({ where: { id: user.id } })).tokenVersion, 1)
ck('OTHER device signed out', await sessionAlive(deviceB), false)
ck('acting device also signed out', await sessionAlive(deviceA), false)
ck('new password logs in', Boolean(await login(EMAIL, 'brand-new-pass-1')), true)

console.log('== DEACTIVATION KILLS LIVE SESSIONS ==')
user = await makeUser()
const live = await login(EMAIL, PASS)
ck('session alive', await sessionAlive(live), true)
await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })
ck('deactivated user signed out', await sessionAlive(live), false)

console.log('== ACCOUNT LOCKOUT ==')
user = await makeUser()
for (let i = 0; i < 4; i++) await login(EMAIL, 'wrong-password')
let row = await prisma.user.findUnique({ where: { id: user.id } })
ck('4 failures counted', row.failedLoginAttempts, 4)
ck('not locked yet', row.lockedUntil, null)
await login(EMAIL, 'wrong-password') // 5th
row = await prisma.user.findUnique({ where: { id: user.id } })
ck('locked after 5', Boolean(row.lockedUntil && row.lockedUntil > new Date()), true)
ck('correct password refused while locked', await login(EMAIL, PASS), null)

// Counter resets on a successful login once the lock lapses.
await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000), failedLoginAttempts: 3 } })
ck('login works after lock expires', Boolean(await login(EMAIL, PASS)), true)
ck('failure counter reset', (await prisma.user.findUnique({ where: { id: user.id } })).failedLoginAttempts, 0)

console.log('== EMAIL VERIFICATION ==')
user = await makeUser({ emailVerified: null })
ck('unverified cannot sign in', await login(EMAIL, PASS), null)
await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } })
ck('verified can sign in', Boolean(await login(EMAIL, PASS)), true)

// Signup should create an unverified user and issue a token.
const signupEmail = `signup-${Date.now()}@example.com`
const su = await fetch(`${B}/api/signup`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  // The registration wizard's required fields (see app/api/signup/route.ts).
  body: JSON.stringify({ name: 'New Admin', email: signupEmail, phone: '0745000123', password: 'signup-pass-123', schoolName: 'Test Academy', levels: ['PRIMARY'], region: 'Kilimanjaro', acceptTerms: true }),
})
const suJson = await su.json()
ck('signup ok', su.status, 200)
ck('signup reports verification required', suJson.requiresVerification, true)
const newUser = await prisma.user.findUnique({ where: { email: signupEmail } })
ck('new user is unverified', newUser.emailVerified, null)
ck('verification token issued', await prisma.verificationToken.count({ where: { identifier: `email-verify:${newUser.id}` } }), 1)
ck('new signup cannot log in yet', await login(signupEmail, 'signup-pass-123'), null)

console.log('== PLAN LIMITS ==')
// Squeeze the demo school's plan down to its current student count.
const students = await prisma.student.count({ where: { schoolId: school.id } })
const staffCount = await prisma.staff.count({ where: { schoolId: school.id } })
const subBefore = await prisma.schoolSubscription.findUnique({ where: { schoolId: school.id } })
await prisma.schoolSubscription.update({
  where: { schoolId: school.id },
  data: { maxStudents: students, maxStaff: staffCount },
})
const admin = await login('admin@kilimanjaro.tz', 'admin123')
const addStudent = await fetch(`${B}/api/students`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: admin },
  body: JSON.stringify({ firstName: 'Over', lastName: 'Limit', admissionNo: `OL-${Date.now()}` }),
})
const alJson = await addStudent.json()
ck('student create blocked at limit', addStudent.status, 409)
ck('response flags limitReached', alJson.limitReached, true)
console.log(`        message: ${alJson.error}`)
const addStaff = await fetch(`${B}/api/teachers`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: admin },
  body: JSON.stringify({ firstName: 'Over', lastName: 'Limit' }),
})
ck('staff create blocked at limit', addStaff.status, 409)

// Raise the cap; creation should succeed again.
await prisma.schoolSubscription.update({ where: { schoolId: school.id }, data: { maxStudents: students + 5 } })
const ok = await fetch(`${B}/api/students`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: admin },
  body: JSON.stringify({ firstName: 'Under', lastName: 'Limit', admissionNo: `UL-${Date.now()}` }),
})
ck('create works under the cap', ok.status, 200)
const created = await ok.json()
await prisma.student.delete({ where: { id: created.id } })

// Restore the school's original plan numbers.
await prisma.schoolSubscription.update({
  where: { schoolId: school.id },
  data: { maxStudents: subBefore.maxStudents, maxStaff: subBefore.maxStaff },
})

console.log('== CLEANUP ==')
await prisma.user.deleteMany({ where: { email: { in: [EMAIL, signupEmail] } } })
// Subscription rows hold an FK to School, so they go first.
const testSchools = await prisma.school.findMany({ where: { name: 'Test Academy' }, select: { id: true } })
const testSchoolIds = testSchools.map((s) => s.id)
if (testSchoolIds.length) {
  await prisma.invoicePayment.deleteMany({ where: { invoice: { schoolId: { in: testSchoolIds } } } })
  await prisma.invoice.deleteMany({ where: { schoolId: { in: testSchoolIds } } })
  await prisma.auditLog.deleteMany({ where: { schoolId: { in: testSchoolIds } } })
  // Signup now also creates the academic year, its terms and lead notifications for super admins.
  await prisma.term.deleteMany({ where: { academicYear: { schoolId: { in: testSchoolIds } } } })
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: testSchoolIds } } })
  await prisma.notification.deleteMany({ where: { title: 'New school registered', message: { contains: 'Test Academy' } } })
  await prisma.schoolSubscription.deleteMany({ where: { schoolId: { in: testSchoolIds } } })
  await prisma.user.deleteMany({ where: { schoolId: { in: testSchoolIds } } })
  await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } })
}
console.log('  test users and school removed')

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
