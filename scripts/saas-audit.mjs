// SaaS audit: two real tenants, then probe every surface for leakage and
// check the platform layer (plans, subscription status, tenant lifecycle).
import { createRequire } from 'node:module'
import fsSync from 'node:fs'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('../node_modules/bcryptjs')
const prisma = new PrismaClient()
const B = process.argv[2] ?? 'http://127.0.0.1:3000'

const findings = []
let pass = 0, fail = 0
function ck(label, actual, expected, severity = 'high') {
  const ok = String(actual) === String(expected)
  console.log(`  ${ok ? 'OK  ' : 'LEAK'} ${label} -> ${actual}${ok ? '' : ` (want ${expected})`}`)
  if (ok) pass++; else { fail++; findings.push({ label, actual, expected, severity }) }
}
function note(label, detail, severity = 'medium') {
  console.log(`  NOTE ${label} — ${detail}`)
  findings.push({ label, actual: detail, expected: '', severity })
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
  const ct = r.headers.get('content-type') ?? ''
  let json = null, text = ''
  if (ct.includes('json')) { try { json = await r.json() } catch {} }
  else { text = await r.text() }
  return { status: r.status, json, text }
}

// ── Tenant A: the seeded school ────────────────────────────────
const A = await prisma.school.findFirst({ where: { name: 'Kilimanjaro Academy' } })
const adminA = await login('admin@kilimanjaro.tz', 'admin123')
const superAdmin = await login('super@shulesms.tz', 'super123')

// ── Tenant B: provisioned the way a real customer would be ─────
const SUFFIX = Date.now()
const created = await api('POST', '/api/schools', { name: `Audit School ${SUFFIX}`, city: 'Mwanza', plan: 'BASIC' }, superAdmin)
const B_ID = created.json?.school?.id
console.log(`tenant A: ${A.name} (${A.id})`)
console.log(`tenant B: Audit School ${SUFFIX} (${B_ID})\n`)

// Give B a full set of records so cross-tenant reads have something to find.
const bAdmin = await prisma.user.create({
  data: {
    email: `b-admin-${SUFFIX}@audit.tz`, name: 'B Admin', role: 'SCHOOL_ADMIN', schoolId: B_ID,
    emailVerified: new Date(), hashedPassword: await bcrypt.hash('bpassword123', 12),
  },
})
const bClass = await prisma.class.create({ data: { name: 'B Form 1', level: 'O_LEVEL', capacity: 30, schoolId: B_ID } })
const bStudent = await prisma.student.create({
  data: { firstName: 'Bee', lastName: 'Pupil', gender: 'FEMALE', dateOfBirth: new Date('2011-01-01'), admissionNo: `B-${SUFFIX}`, schoolId: B_ID, classId: bClass.id },
})
const bSubject = await prisma.subject.create({ data: { name: 'B Subject', schoolId: B_ID } })
const bYear = await prisma.academicYear.create({ data: { name: '2026', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), schoolId: B_ID } })
const bFee = await prisma.feeStructure.create({ data: { name: 'B Fee', amount: 100000, schoolId: B_ID } })
const bBook = await prisma.book.create({ data: { title: 'B Book', totalCopies: 2, available: 2, schoolId: B_ID } })
const bStaff = await prisma.staff.create({ data: { firstName: 'B', lastName: 'Teacher', gender: 'MALE', employeeNo: `BEMP-${SUFFIX}`, role: 'Teacher', schoolId: B_ID } })
const bGuardian = await prisma.guardian.create({
  data: { firstName: 'B', lastName: 'Parent', phone: '0766000111', email: `b-parent-${SUFFIX}@audit.tz`, students: { create: { studentId: bStudent.id } } },
})
const bAnnouncement = await prisma.announcement.create({ data: { title: 'B Notice', content: 'Internal to B', isPublic: true, schoolId: B_ID } })
const bEvent = await prisma.event.create({ data: { title: 'B Event', startDate: new Date('2026-06-01'), schoolId: B_ID } })
const adminB = await login(`b-admin-${SUFFIX}@audit.tz`, 'bpassword123')

console.log('=== 1. CAN TENANT A REACH TENANT B\'S RECORDS? ===')
ck('read B\'s student', (await api('PATCH', '/api/students', { id: bStudent.id, firstName: 'Hacked' }, adminA)).status, 404)
ck('delete B\'s student', (await api('DELETE', `/api/students?id=${bStudent.id}`, undefined, adminA)).status, 404)
ck('edit B\'s class', (await api('PATCH', '/api/classes', { id: bClass.id, name: 'Hacked' }, adminA)).status, 404)
ck('delete B\'s class', (await api('DELETE', `/api/classes?id=${bClass.id}`, undefined, adminA)).status, 404)
ck('edit B\'s staff', (await api('PATCH', '/api/teachers', { id: bStaff.id, firstName: 'Hacked' }, adminA)).status, 404)
ck('edit B\'s subject', (await api('PATCH', '/api/subjects', { id: bSubject.id, name: 'Hacked' }, adminA)).status, 404)
ck('delete B\'s academic year', (await api('DELETE', `/api/academic-years?id=${bYear.id}`, undefined, adminA)).status, 404)
ck('edit B\'s guardian', (await api('PATCH', '/api/guardians', { id: bGuardian.id, phone: '0700000000' }, adminA)).status, 404)
ck('delete B\'s announcement', (await api('DELETE', `/api/announcements?id=${bAnnouncement.id}`, undefined, adminA)).status, 404)
ck('delete B\'s event', (await api('DELETE', `/api/events?id=${bEvent.id}`, undefined, adminA)).status, 404)
ck('pay B\'s fee', (await api('POST', '/api/fees/payment', { studentId: bStudent.id, feeStructureId: bFee.id, amount: 1 }, adminA)).status, 404)
ck('issue B\'s book', (await api('POST', '/api/library/issue', { bookId: bBook.id, studentId: bStudent.id }, adminA)).status, 404)
ck('mark B\'s attendance', (await api('POST', '/api/attendance', { entries: [{ studentId: bStudent.id, date: '2026-05-01', status: 'PRESENT' }] }, adminA)).status, 403)
ck('create exam in B\'s class', (await api('POST', '/api/exams', { name: 'X', classId: bClass.id, subjectId: bSubject.id, academicYearId: bYear.id }, adminA)).status, 404)
ck('add timetable slot to B\'s class', (await api('POST', '/api/timetable', { classId: bClass.id, subjectId: bSubject.id, dayOfWeek: 1, startTime: '08:00', endTime: '08:45' }, adminA)).status, 404)
ck('print B\'s report card', (await api('GET', `/api/reports/report-card?studentId=${bStudent.id}`, undefined, adminA)).status, 404)
ck('print B\'s fee statement', (await api('GET', `/api/reports/fee-statement?studentId=${bStudent.id}`, undefined, adminA)).status, 404)
ck('provision a login for B\'s pupil', (await api('POST', '/api/students/account', { studentId: bStudent.id }, adminA)).status, 404)
ck('provision a login for B\'s guardian', (await api('POST', '/api/guardians/account', { guardianId: bGuardian.id }, adminA)).status, 404)
ck('SMS B\'s class', (await api('POST', '/api/sms', { audience: 'class-guardians', classId: bClass.id, text: 'x' }, adminA)).status, 404)

console.log('\n=== 2. DO A\'S LISTS LEAK B\'S ROWS? ===')
const aStudents = await api('GET', '/api/students', undefined, adminA)
ck('student list excludes B', aStudents.json?.some((s) => s.id === bStudent.id), false)
const aClasses = await api('GET', '/api/classes', undefined, adminA)
ck('class list excludes B', aClasses.json?.some((c) => c.id === bClass.id), false)
const aSubjects = await api('GET', '/api/subjects', undefined, adminA)
ck('subject list excludes B', aSubjects.json?.some((s) => s.id === bSubject.id), false)
const aGuardians = await api('GET', '/api/guardians', undefined, adminA)
ck('guardian list excludes B', aGuardians.json?.some((g) => g.id === bGuardian.id), false)
const aYears = await api('GET', '/api/academic-years', undefined, adminA)
ck('academic years exclude B', aYears.json?.some((y) => y.id === bYear.id), false)
const csv = await api('GET', '/api/reports/export?type=students', undefined, adminA)
ck('CSV export excludes B', (csv.text ?? '').includes('Bee'), false)
const aSms = await api('GET', '/api/sms', undefined, adminA)
ck('SMS log is per-tenant', JSON.stringify(aSms.json?.logs ?? []).includes(`b-parent-${SUFFIX}`), false)

console.log('\n=== 3. DOES B SEE ONLY B? ===')
const bStudents = await api('GET', '/api/students', undefined, adminB)
ck('B sees its own pupil', bStudents.json?.some((s) => s.id === bStudent.id), true)
ck('B does not see A\'s 100 pupils', bStudents.json?.length, 1)
const bSmsPreview = await api('PATCH', '/api/sms', { audience: 'all-guardians', text: 'hi' }, adminB)
ck('B\'s SMS audience is only B\'s parents', bSmsPreview.json?.recipients, 1)

console.log('\n=== 4. PLATFORM LAYER: PLANS AND SUBSCRIPTION STATUS ===')
const subB = await prisma.schoolSubscription.findUnique({ where: { schoolId: B_ID } })
ck('BASIC plan limits applied at provisioning', `${subB.maxStudents}/${subB.maxStaff}`, '300/40')

// Suspend the subscription — a customer who has not paid.
await api('PATCH', '/api/schools', { schoolId: B_ID, status: 'SUSPENDED' }, superAdmin)
const suspended = await prisma.schoolSubscription.findUnique({ where: { schoolId: B_ID } })
ck('super admin can suspend', suspended.status, 'SUSPENDED')
// Intended contract: unpaid tenants go read-only, not dark. Reads keep working
// so a school can still see its own register; writes are refused.
ck('suspended tenant can still read', (await api('GET', '/api/students', undefined, adminB)).status, 200)
const writeSuspended = await api('POST', '/api/students', { firstName: 'S', lastName: 'T', admissionNo: `SUS-${SUFFIX}` }, adminB)
ck('suspended tenant cannot write', writeSuspended.status, 402)
ck('and nothing was created', await prisma.student.count({ where: { admissionNo: `SUS-${SUFFIX}` } }), 0)

// Expire it outright.
await api('PATCH', '/api/schools', { schoolId: B_ID, status: 'EXPIRED' }, superAdmin)
ck('expired tenant cannot write', (await api('POST', '/api/students', { firstName: 'E', lastName: 'X', admissionNo: `EXP-${SUFFIX}` }, adminB)).status, 402)
const loginWhileExpired = await login(`b-admin-${SUFFIX}@audit.tz`, 'bpassword123')
ck('expired tenant can still sign in (read-only by design)', Boolean(loginWhileExpired), true)
ck('but still cannot write on a fresh session', (await api('POST', '/api/students', { firstName: 'E', lastName: 'Y', admissionNo: `EXP2-${SUFFIX}` }, loginWhileExpired)).status, 402)

console.log('\n=== 5. TENANT LIFECYCLE: DEACTIVATING A SCHOOL ===')
await api('PATCH', '/api/schools', { schoolId: B_ID, isActive: false }, superAdmin)
const school = await prisma.school.findUnique({ where: { id: B_ID } })
ck('super admin can deactivate the tenant', school.isActive, false)
ck('deactivated tenant cannot sign in', await login(`b-admin-${SUFFIX}@audit.tz`, 'bpassword123'), null)
ck('and its live session is dead', (await api('GET', '/api/students', undefined, adminB)).status, 401)

console.log('\n=== 6. PLAN LIMITS AND DOWNGRADES ===')
await api('PATCH', '/api/schools', { schoolId: B_ID, isActive: true, status: 'ACTIVE' }, superAdmin)
// Downgrade A to FREE (50 students) while it holds 100.
const subABefore = await prisma.schoolSubscription.findUnique({ where: { schoolId: A.id } })
await api('PATCH', '/api/schools', { schoolId: A.id, plan: 'FREE' }, superAdmin)
const subAfter = await prisma.schoolSubscription.findUnique({ where: { schoolId: A.id } })
const studentsA = await prisma.student.count({ where: { schoolId: A.id } })
ck('downgrade applies the new caps', subAfter.maxStudents, 50)
note('downgrading below current usage is allowed', `${studentsA} pupils now sit above a cap of ${subAfter.maxStudents}; existing rows are untouched and only new creates are blocked`, 'low')
const blocked = await api('POST', '/api/students', { firstName: 'Over', lastName: 'Cap', admissionNo: `CAP-${SUFFIX}` }, adminA)
ck('creates blocked while over the cap', blocked.status, 409)
// Restore A.
await prisma.schoolSubscription.update({ where: { schoolId: A.id }, data: { plan: subABefore.plan, maxStudents: subABefore.maxStudents, maxStaff: subABefore.maxStaff } })

console.log('\n=== 7. WHO CAN ADMINISTER THE PLATFORM? ===')
ck('a school admin cannot create schools', (await api('POST', '/api/schools', { name: 'Sneaky' }, adminA)).status, 403)
ck('a school admin cannot change plans', (await api('PATCH', '/api/schools', { schoolId: A.id, plan: 'ENTERPRISE' }, adminA)).status, 403)
ck('a school admin cannot suspend a rival', (await api('PATCH', '/api/schools', { schoolId: B_ID, isActive: false }, adminA)).status, 403)
ck('anonymous cannot reach the platform API', (await api('POST', '/api/schools', { name: 'x' }, '')).status, 401)

console.log('\n=== 8. BACKUPS IN A MULTI-TENANT WORLD ===')
const perTenant = fsSync.existsSync('scripts/backup-school.mjs') && fsSync.existsSync('scripts/restore-school.mjs')
ck('per-school backup and restore exist', perTenant, true)

console.log('\n=== 9. BILLING ===')
const anyInvoice = Object.keys(prisma).filter((k) => /invoice|payment|billing|subscriptionEvent/i.test(k) && !k.startsWith('$') && !k.startsWith('_'))
note('no billing records exist', `plan and status are stored on SchoolSubscription, but there is no invoice, charge or payment-attempt model (found: ${anyInvoice.join(', ') || 'none'}), so nothing records what a school was charged or whether they paid`, 'medium')
const sub = await prisma.schoolSubscription.findUnique({ where: { schoolId: B_ID } })
if (sub.endDate === null) note('subscriptions have no end date set', 'SchoolSubscription.endDate is nullable and left null at provisioning, so nothing can expire on its own', 'medium')

// ── Cleanup ────────────────────────────────────────────────────
console.log('\n=== CLEANUP ===')
await prisma.studentGuardian.deleteMany({ where: { guardianId: bGuardian.id } })
await prisma.guardian.deleteMany({ where: { id: bGuardian.id } })
await prisma.announcement.deleteMany({ where: { schoolId: B_ID } })
await prisma.event.deleteMany({ where: { schoolId: B_ID } })
await prisma.feeStructure.deleteMany({ where: { schoolId: B_ID } })
await prisma.book.deleteMany({ where: { schoolId: B_ID } })
await prisma.student.deleteMany({ where: { schoolId: B_ID } })
await prisma.class.deleteMany({ where: { schoolId: B_ID } })
await prisma.subject.deleteMany({ where: { schoolId: B_ID } })
await prisma.academicYear.deleteMany({ where: { schoolId: B_ID } })
await prisma.staff.deleteMany({ where: { schoolId: B_ID } })
await prisma.smsLog.deleteMany({ where: { schoolId: B_ID } })
// Provisioning now raises an invoice, which holds a foreign key on the school.
await prisma.invoicePayment.deleteMany({ where: { invoice: { schoolId: B_ID } } })
await prisma.invoice.deleteMany({ where: { schoolId: B_ID } })
await prisma.auditLog.deleteMany({ where: { schoolId: B_ID } })
await prisma.user.deleteMany({ where: { schoolId: B_ID } })
await prisma.schoolSubscription.deleteMany({ where: { schoolId: B_ID } })
await prisma.school.deleteMany({ where: { id: B_ID } })
console.log('  tenant B removed')

console.log(`\n${pass} isolation checks passed, ${fail} leaked`)
const high = findings.filter((f) => f.severity === 'high')
console.log(`${findings.length} finding(s): ${high.length} high`)
for (const f of findings) console.log(`  [${f.severity}] ${f.label}`)
await prisma.$disconnect()
