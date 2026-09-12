// Roles & permissions matrix, super-admin separation, and the cross-tenant regressions from the Sept 2026 audit.
//   node scripts/roles-permissions-test.mjs [baseUrl]

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
  return { status: r.status, body: type.includes('json') ? await r.json().catch(() => ({})) : await r.text(), location: r.headers.get('location') }
}
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }); return { status: r.status, location: r.headers.get('location'), html: (await r.text()).replace(/<!--.*?-->/g, '') } }

const TAG = 'RPT'
const K = 'school-kilimanjaro'
async function cleanup() {
  const other = await prisma.school.findFirst({ where: { name: `Other School ${TAG}` }, select: { id: true } })
  const users = (await prisma.user.findMany({ where: { email: { endsWith: `.${TAG.toLowerCase()}@x.tz` } }, select: { id: true } })).map((u) => u.id)
  if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } }); await prisma.notification.deleteMany({ where: { userId: { in: users } } }) }
  await prisma.staff.deleteMany({ where: { employeeNo: { startsWith: `${TAG}-` } } })
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.rolePermission.deleteMany({ where: { schoolId: K } })
  await prisma.examResult.deleteMany({ where: { exam: { name: `Exam ${TAG}` } } })
  await prisma.exam.deleteMany({ where: { name: `Exam ${TAG}` } })
  const kStudents = (await prisma.student.findMany({ where: { admissionNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)
  if (kStudents.length) { await prisma.studentGuardian.deleteMany({ where: { studentId: { in: kStudents } } }); await prisma.student.deleteMany({ where: { id: { in: kStudents } } }) }
  await prisma.guardian.deleteMany({ where: { lastName: `Guardian${TAG}` } })
  await prisma.feeStructure.deleteMany({ where: { name: `Fee ${TAG}` } })
  await prisma.assignment.deleteMany({ where: { title: `HW ${TAG}` } })
  await prisma.class.deleteMany({ where: { name: { endsWith: ` ${TAG}` } } })
  if (other) {
    await prisma.student.deleteMany({ where: { schoolId: other.id } }); await prisma.class.deleteMany({ where: { schoolId: other.id } })
    await prisma.schoolSubscription.deleteMany({ where: { schoolId: other.id } }); await prisma.school.delete({ where: { id: other.id } })
  }
}
await cleanup()

// Fixtures: a second school with a class and a pupil, and in Kilimanjaro a teacher login, an accountant and a class.
const other = await prisma.school.create({ data: { name: `Other School ${TAG}`, schoolLevel: ['PRIMARY'], subscription: { create: { plan: 'FREE', maxStudents: 50, maxStaff: 10 } } } })
const oClass = await prisma.class.create({ data: { name: `Std 1 ${TAG}`, level: 'PRIMARY', schoolId: other.id } })
const oPupil = await prisma.student.create({ data: { admissionNo: `O-${TAG}-1`, firstName: 'Far', lastName: 'Away', gender: 'MALE', dateOfBirth: new Date('2015-01-01'), schoolId: other.id, classId: oClass.id } })
const kClass = await prisma.class.create({ data: { name: `Std 2 ${TAG}`, level: 'PRIMARY', schoolId: K } })
const kPupil = await prisma.student.create({ data: { admissionNo: `${TAG}-1`, firstName: 'Near', lastName: 'Home', gender: 'FEMALE', dateOfBirth: new Date('2015-01-01'), schoolId: K, classId: kClass.id } })
const guardian = await prisma.guardian.create({ data: { firstName: 'Two', lastName: `Guardian${TAG}`, phone: '+255700000999', students: { create: [{ studentId: kPupil.id, isPrimary: true }, { studentId: oPupil.id, isPrimary: true }] } } })
const pw = await bcrypt.hash('pass1234', 10)
const teacherUser = await prisma.user.create({ data: { email: `teacher.${TAG.toLowerCase()}@x.tz`, name: 'Teacher RPT', role: 'TEACHER', hashedPassword: pw, schoolId: K, emailVerified: new Date() } })
const teacherStaff = await prisma.staff.create({ data: { employeeNo: `${TAG}-T1`, firstName: 'Teacher', lastName: 'RPT', gender: 'FEMALE', schoolId: K, userId: teacherUser.id } })
await prisma.class.update({ where: { id: kClass.id }, data: { classTeacherId: teacherStaff.id } })
await prisma.user.create({ data: { email: `bursar.${TAG.toLowerCase()}@x.tz`, name: 'Bursar RPT', role: 'ACCOUNTANT', hashedPassword: pw, schoolId: K, emailVerified: new Date() } })

const admin = await login('admin@kilimanjaro.tz', 'admin123')
const teacher = await login(`teacher.${TAG.toLowerCase()}@x.tz`, 'pass1234')
const bursar = await login(`bursar.${TAG.toLowerCase()}@x.tz`, 'pass1234')
const superc = await login('super@shulesms.tz', 'super123')
ck('logins', !!(admin && teacher && bursar && superc), true)

console.log('\n# Super admin is a platform role, not a member of every school')
let r = await api('/api/students', superc); ck('super admin GET /api/students -> 403', r.status, 403)
r = await api('/api/hostel', superc, { method: 'POST', body: JSON.stringify({ type: 'dormitory', name: 'x' }) }); ck('super admin POST /api/hostel -> 403', r.status, 403)
r = await api('/api/settings', superc); ck('super admin GET /api/settings -> 403', r.status, 403)
r = await api('/api/billing', superc); ck('super admin platform route still works', r.status, 200)
let p = await page('/dashboard/hostel', superc); ck('super admin /dashboard/hostel redirects', p.status, 307); ck('  to the platform console', p.location?.includes('/dashboard/super-admin'), true)
p = await page('/dashboard/super-admin', superc); ck('super admin console renders', p.status, 200)
ck('  sidebar shows no school pages', p.html.includes('/dashboard/hostel"') || p.html.includes('/dashboard/students"'), false)

console.log('\n# Per-school permission matrix')
r = await api('/api/settings/roles', admin); ck('GET matrix', r.status, 200)
const feesRow = r.body.matrix.find((m) => m.key === 'fees'); ck('  fees: teacher default off', feesRow.roles.TEACHER.allowed, false); ck('  fees: accountant default on', feesRow.roles.ACCOUNTANT.allowed, true)
ck('  ownRecord is fixed for teachers', r.body.matrix.find((m) => m.key === 'ownRecord').roles.TEACHER.configurable, false)
const feePost = (c) => api('/api/fees', c, { method: 'POST', body: JSON.stringify({ name: `Fee ${TAG}`, amount: 500 }) })
const settle = () => new Promise((res) => setTimeout(res, 2300)) // permission cache TTL
r = await feePost(teacher); ck('teacher POST /api/fees by default -> 403', r.status, 403)
p = await page('/dashboard', teacher); ck('  teacher sidebar has no Fees link', p.html.includes('href="/dashboard/fees"'), false)
r = await api('/api/settings/roles', admin, { method: 'PUT', body: JSON.stringify({ changes: [{ role: 'TEACHER', capability: 'fees', allowed: true }, { role: 'TEACHER', capability: 'ownRecord', allowed: true }] }) })
ck('PUT grant fees to teachers', r.status, 200); ck('  fixed cell ignored, one applied', r.body.applied, 1); await settle()
ck('  matrix reflects grant', r.body.matrix.find((m) => m.key === 'fees').roles.TEACHER.allowed, true)
r = await feePost(teacher); ck('teacher POST /api/fees now -> 200', r.status, 200)
p = await page('/dashboard', teacher); ck('  teacher sidebar now has Fees link', p.html.includes('href="/dashboard/fees"'), true)
p = await page('/dashboard/fees', teacher); ck('  fees page opens for teacher', p.status, 200)
r = await api('/api/settings/roles', admin, { method: 'PUT', body: JSON.stringify({ changes: [{ role: 'ACCOUNTANT', capability: 'fees', allowed: false }] }) }); ck('PUT revoke fees from accountant', r.status, 200); await settle()
r = await feePost(bursar); ck('accountant POST /api/fees now -> 403', r.status, 403)
p = await page('/dashboard/fees', bursar); ck('  fees page redirects the accountant', p.status, 307)
r = await api('/api/settings/roles', bursar, { method: 'PUT', body: JSON.stringify({ changes: [{ role: 'ACCOUNTANT', capability: 'fees', allowed: true }] }) }); ck('accountant cannot edit the matrix', r.status, 403)
r = await api('/api/settings/roles', admin, { method: 'PUT', body: JSON.stringify({ changes: [{ role: 'TEACHER', capability: 'nope', allowed: true }] }) }); ck('unknown capability -> 400', r.status, 400)
r = await api('/api/settings/roles', admin, { method: 'DELETE' }); ck('reset to defaults', r.status, 200); ck('  removed 2 adjustments', r.body.removed, 2); await settle()
r = await feePost(teacher); ck('teacher back to 403', r.status, 403); r = await feePost(bursar); ck('accountant back to 200', r.status, 200)
const audit = await prisma.auditLog.count({ where: { entity: 'RolePermission' } }); ck('matrix changes audited', audit >= 3, true)

console.log('\n# Cross-tenant regressions (audit A1–A3, C1)')
const subj = await prisma.subject.findFirst({ where: { schoolId: K } }); const term = await prisma.term.findFirst({ where: { academicYear: { schoolId: K } }, include: { academicYear: true } })
const exam = await prisma.exam.create({ data: { name: `Exam ${TAG}`, classId: kClass.id, subjectId: subj.id, termId: term.id, academicYearId: term.academicYearId, date: new Date(), totalMarks: 100, type: 'CAT' } }).catch(async (e) => { console.log('   (exam fixture)', e.message.split('\n').pop()); return null })
if (exam) {
  r = await api('/api/exams/results', admin, { method: 'POST', body: JSON.stringify({ examId: exam.id, results: [{ studentId: oPupil.id, marks: 50 }] }) })
  ck('A1 marks for another school\'s pupil -> 400', r.status, 400); ck('  nothing written', await prisma.examResult.count({ where: { studentId: oPupil.id } }), 0)
  r = await api('/api/exams/results', admin, { method: 'POST', body: JSON.stringify({ examId: exam.id, results: [{ studentId: kPupil.id, marks: 50 }] }) }); ck('  own pupil still fine', r.status, 200)
}
r = await api(`/api/guardians/link?guardianId=${guardian.id}&studentId=${oPupil.id}`, admin, { method: 'DELETE' })
ck('A2 unlinking the other school\'s child -> 404', r.status, 404); ck('  link intact', await prisma.studentGuardian.count({ where: { studentId: oPupil.id, guardianId: guardian.id } }), 1)
r = await api('/api/students', admin, { method: 'POST', body: JSON.stringify({ firstName: 'X', lastName: 'Y', admissionNo: `${TAG}-9`, classId: oClass.id }) }); ck('A3 enrol into another school\'s class -> 400', r.status, 400)
r = await api('/api/students', admin, { method: 'PATCH', body: JSON.stringify({ id: kPupil.id, classId: oClass.id }) }); ck('A3 move pupil into another school\'s class -> 400', r.status, 400)
r = await api('/api/fees', admin, { method: 'POST', body: JSON.stringify({ name: `Fee ${TAG}`, amount: 1000, classId: oClass.id }) }); ck('A3 fee structure on another school\'s class -> 400', r.status, 400)
r = await api('/api/fees', admin, { method: 'POST', body: JSON.stringify({ name: `Fee ${TAG}`, amount: 1000, classId: kClass.id }) }); ck('  own class fine', r.status, 200)
r = await api('/api/homework', admin, { method: 'POST', body: JSON.stringify({ title: `HW ${TAG}`, kind: 'HOMEWORK', classId: kClass.id, subjectId: subj.id, description: 'Read chapter 1' }) })
const hwId = r.body?.assignment?.id; ck('homework fixture', !!hwId, true)
if (hwId) { r = await api('/api/homework', admin, { method: 'PATCH', body: JSON.stringify({ id: hwId, classId: oClass.id }) }); ck('A3 move homework to another school\'s class -> 400', r.status, 400) }

await cleanup()
console.log(`\n${pass} passed, ${fail} failed`)
await prisma.$disconnect()
process.exit(fail ? 1 : 0)
