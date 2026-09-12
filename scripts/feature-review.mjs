// Functional review of every module: exercises the real endpoints as a real
// user, then cleans up. Reports per-module status.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('../node_modules/bcryptjs')
const prisma = new PrismaClient()
const B = process.argv[2] ?? 'http://127.0.0.1:3000'

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
if (!admin) { console.error('admin login failed'); process.exit(1) }

const results = []
function rec(module, check, ok, note = '') {
  results.push({ module, check, ok, note })
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${module.padEnd(14)} ${check}${note ? ` — ${note}` : ''}`)
}

async function api(method, path, body, cookie = admin) {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null; try { json = await r.json() } catch {}
  return { status: r.status, json }
}

const school = await prisma.school.findFirst()
const cls = await prisma.class.findFirst({ where: { schoolId: school.id } })
// A throwaway student so module tests never mutate or delete seed data.
await prisma.student.deleteMany({ where: { admissionNo: 'REVIEW-FIXTURE' } })
const student = await prisma.student.create({ data: { firstName: 'Fixture', lastName: 'Student', gender: 'MALE', dateOfBirth: new Date('2012-01-01'), admissionNo: 'REVIEW-FIXTURE', schoolId: school.id, classId: cls.id } })
// For the FK-guard check, a seeded student that actually has linked records.
const linkedStudent = await prisma.student.findFirst({ where: { schoolId: school.id, examResults: { some: {} } } })
const staff = await prisma.staff.findFirst({ where: { schoolId: school.id } })
const subject = await prisma.subject.findFirst({ where: { schoolId: school.id } })
const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id } })

console.log('\n=== STUDENTS ===')
{
  const c = await api('POST', '/api/students', { firstName: 'Rev', lastName: 'Iew', admissionNo: `RV-${Date.now()}`, classId: cls.id })
  rec('students', 'create', c.status === 200)
  if (c.status === 200) {
    rec('students', 'edit', (await api('PATCH', '/api/students', { id: c.json.id, firstName: 'Rev2' })).status === 200)
    rec('students', 'list', (await api('GET', '/api/students')).json?.length > 0)
    rec('students', 'delete', (await api('DELETE', `/api/students?id=${c.json.id}`)).status === 200)
  }
  const fk = await api('DELETE', `/api/students?id=${linkedStudent.id}`)
  rec('students', 'FK guard on delete', fk.status === 409, fk.json?.error?.slice(0, 60))
}

console.log('\n=== TEACHERS / STAFF ===')
{
  const c = await api('POST', '/api/teachers', { firstName: 'Rev', lastName: 'Staff', employeeNo: `EMP-RV-${Date.now()}` })
  rec('teachers', 'create', c.status === 200)
  if (c.status === 200) {
    rec('teachers', 'edit', (await api('PATCH', '/api/teachers', { id: c.json.id, firstName: 'Rev2' })).status === 200)
    rec('teachers', 'delete', (await api('DELETE', `/api/teachers?id=${c.json.id}`)).status === 200)
  }
}

console.log('\n=== CLASSES ===')
{
  const c = await api('POST', '/api/classes', { name: `Review ${Date.now()}`, level: 'PRIMARY', capacity: 30 })
  rec('classes', 'create', c.status === 200)
  if (c.status === 200) {
    rec('classes', 'edit', (await api('PATCH', '/api/classes', { id: c.json.id, capacity: 35 })).status === 200)
    rec('classes', 'delete', (await api('DELETE', `/api/classes?id=${c.json.id}`)).status === 200)
  }
  const occupied = await api('DELETE', `/api/classes?id=${cls.id}`)
  rec('classes', 'blocks delete with students', occupied.status === 409, occupied.json?.error?.slice(0, 50))
}

console.log('\n=== ATTENDANCE ===')
{
  const date = '2026-03-02'
  const save = await api('POST', '/api/attendance', { entries: [{ studentId: student.id, date, status: 'PRESENT' }] })
  rec('attendance', 'save marks', save.status === 200)
  const load = await api('GET', `/api/attendance?classId=${student.classId}&date=${date}`)
  rec('attendance', 'load existing', load.json?.attendance?.[student.id] === 'PRESENT')
  const cross = await api('POST', '/api/attendance', { entries: [{ studentId: 'not-mine', date, status: 'PRESENT' }] })
  rec('attendance', 'rejects foreign student', cross.status === 403)
  await prisma.attendance.deleteMany({ where: { studentId: student.id, date: new Date(date) } })
}

console.log('\n=== EXAMS & RESULTS ===')
{
  const e = await api('POST', '/api/exams', { name: 'Review Exam', type: 'CAT', classId: cls.id, subjectId: subject.id, academicYearId: year.id, totalMarks: 100 })
  rec('exams', 'create', e.status === 200)
  if (e.status === 200) {
    const g = await api('GET', `/api/exams/results?examId=${e.json.id}`)
    rec('exams', 'loads class students for marks', Array.isArray(g.json?.students) && g.json.students.length > 0, `${g.json?.students?.length ?? 0} students`)
    const s = await api('POST', '/api/exams/results', { examId: e.json.id, results: [{ studentId: student.id, marks: 82 }] })
    rec('exams', 'save marks + auto grade', s.status === 200)
    const back = await api('GET', `/api/exams/results?examId=${e.json.id}`)
    const saved = back.json?.students?.find((x) => x.id === student.id)
    rec('exams', 'marks persisted', saved?.marks === 82, `grade ${saved?.grade ?? '?'}`)
    await prisma.examResult.deleteMany({ where: { examId: e.json.id } })
    await prisma.exam.delete({ where: { id: e.json.id } })
  }
  const bad = await api('POST', '/api/exams', { name: 'X', classId: 'foreign', subjectId: subject.id, academicYearId: year.id })
  rec('exams', 'rejects foreign class', bad.status === 404)
}

console.log('\n=== FEES ===')
{
  const f = await api('POST', '/api/fees', { name: 'Review Fee', amount: 50000, classId: cls.id, term: 'Term 1' })
  rec('fees', 'create structure', f.status === 200, `status ${f.status}`)
  const p = await api('POST', '/api/fees/payment', { studentId: student.id, feeStructureId: f.json?.id, amount: 10000, paymentMethod: 'CASH' })
  rec('fees', 'record payment', p.status === 200)
  rec('fees', 'auto receipt number', Boolean(p.json?.receiptNo), p.json?.receiptNo ?? '')
  if (p.status === 200) await prisma.feePayment.delete({ where: { id: p.json.id } })
  if (f.status === 200 && f.json?.id) await prisma.feeStructure.delete({ where: { id: f.json.id } })
}

console.log('\n=== LIBRARY ===')
{
  const shelf = await api('POST', '/api/library/categories', { name: 'Textbooks' })
  const b = await api('POST', '/api/library', { title: 'Review Book', author: 'Tester', totalCopies: 2, categoryId: shelf.json?.category?.id })
  rec('library', 'add book', b.status === 200)
  if (b.status === 200) {
    const iss = await api('POST', '/api/library/issue', { bookId: b.json.id, studentId: student.id, dueDate: '2026-04-01' })
    rec('library', 'issue book', iss.status === 200)
    const after = await prisma.book.findUnique({ where: { id: b.json.id } })
    rec('library', 'availability decremented', after.available === 1, `${after.available}/2`)
    if (iss.status === 200) {
      const ret = await api('POST', '/api/library/return', { issueId: iss.json.id })
      rec('library', 'return book', ret.status === 200)
      const back = await prisma.book.findUnique({ where: { id: b.json.id } })
      rec('library', 'availability restored', back.available === 2, `${back.available}/2`)
    }
    await prisma.bookIssue.deleteMany({ where: { bookId: b.json.id } })
    await prisma.book.delete({ where: { id: b.json.id } })
  }
}

console.log('\n=== HOSTEL ===')
{
  const d = await api('POST', '/api/hostel', { type: 'dormitory', name: `Rev Dorm ${Date.now()}`, capacity: 10, gender: 'MALE' })
  rec('hostel', 'add dormitory', d.status === 200)
  if (d.status === 200) {
    const r = await api('POST', '/api/hostel', { type: 'room', dormitoryId: d.json.id, roomNumber: 'R1', capacity: 1 })
    rec('hostel', 'add room', r.status === 200)
    if (r.status === 200) {
      const a = await api('POST', '/api/hostel/assign', { studentId: student.id, roomId: r.json.id })
      rec('hostel', 'assign student', a.status === 200)
      const s2 = await prisma.student.findFirst({ where: { schoolId: school.id, id: { not: student.id } } })
      const full = await api('POST', '/api/hostel/assign', { studentId: s2.id, roomId: r.json.id })
      rec('hostel', 'capacity enforced', full.status === 409 || full.status === 400, full.json?.error?.slice(0, 40))
      await api('DELETE', `/api/hostel/assign?studentId=${student.id}`)
      await prisma.room.delete({ where: { id: r.json.id } })
    }
    await prisma.dormitory.delete({ where: { id: d.json.id } })
  }
}

console.log('\n=== TRANSPORT ===')
{
  const rt = await api('POST', '/api/transport', { type: 'route', name: `Rev Route ${Date.now()}`, fare: 5000 })
  rec('transport', 'add route', rt.status === 200)
  const vh = await api('POST', '/api/transport', { type: 'vehicle', plateNumber: `T${Date.now()}`.slice(0, 10), capacity: 20 })
  rec('transport', 'add vehicle', vh.status === 200)
  if (rt.status === 200) {
    const a = await api('POST', '/api/transport/assign', { studentId: student.id, routeId: rt.json.id })
    rec('transport', 'assign student', a.status === 200)
    await api('DELETE', `/api/transport/assign?studentId=${student.id}`)
    await prisma.transportRoute.delete({ where: { id: rt.json.id } })
  }
  if (vh.status === 200) await prisma.vehicle.delete({ where: { id: vh.json.id } })
}

console.log('\n=== TIMETABLE ===')
{
  const t = await api('POST', '/api/timetable', { classId: cls.id, subjectId: subject.id, staffId: staff.id, dayOfWeek: 1, startTime: '08:00', endTime: '08:45', room: 'R1' })
  rec('timetable', 'add slot', t.status === 200)
  if (t.status === 200) {
    rec('timetable', 'remove slot', (await api('DELETE', `/api/timetable?id=${t.json.slot.id}`)).status === 200)
  }
}

console.log('\n=== EVENTS / ANNOUNCEMENTS / NOTIFICATIONS ===')
{
  const e = await api('POST', '/api/events', { title: 'Review Event', startDate: '2026-05-01', endDate: '2026-05-02' })
  rec('events', 'create', e.status === 200)
  if (e.status === 200) rec('events', 'delete', (await api('DELETE', `/api/events?id=${e.json.id}`)).status === 200)

  const beforeNotif = (await api('GET', '/api/notifications')).json?.unread ?? 0
  const a = await api('POST', '/api/announcements', { title: 'Review Notice', content: 'Body', isPublic: true })
  rec('announcements', 'create', a.status === 200)
  const afterNotif = (await api('GET', '/api/notifications')).json?.unread ?? 0
  rec('announcements', 'fans out notifications', afterNotif > beforeNotif, `${beforeNotif} -> ${afterNotif}`)
  if (a.status === 200) await api('DELETE', `/api/announcements?id=${a.json.id}`)

  const n = await api('GET', '/api/notifications')
  rec('notifications', 'list + unread count', typeof n.json?.unread === 'number')
  rec('notifications', 'mark all read', (await api('PATCH', '/api/notifications', { all: true })).status === 200)
}

console.log('\n=== REPORTS ===')
for (const t of ['students', 'fees', 'attendance', 'staff', 'library', 'grades']) {
  const r = await fetch(`${B}/api/reports/export?type=${t}`, { headers: { Cookie: admin } })
  const body = await r.text()
  rec('reports', `CSV export: ${t}`, r.status === 200 && body.includes(','), `${body.split('\n').length} rows`)
}

console.log('\n=== SETTINGS ===')
{
  const g = await api('GET', '/api/settings')
  rec('settings', 'load school profile', g.status === 200 && Boolean(g.json?.name))
  const p = await api('PUT', '/api/settings', { ...g.json, motto: 'Review motto' })
  rec('settings', 'persist edits', p.status === 200)
  await api('PUT', '/api/settings', g.json)
}

console.log('\n=== SUPER ADMIN ===')
{
  const sup = await login('super@shulesms.tz', 'super123')
  const list = await fetch(`${B}/dashboard/super-admin`, { headers: { Cookie: sup }, redirect: 'manual' })
  rec('super-admin', 'panel reachable', list.status === 200)
  const created = await api('POST', '/api/schools', { name: `Rev School ${Date.now()}`, plan: 'BASIC' }, sup)
  rec('super-admin', 'create school', created.status === 200)
  if (created.status === 200) {
    const newSchoolId = created.json?.school?.id
    const patched = await api('PATCH', '/api/schools', { schoolId: newSchoolId, plan: 'PREMIUM', isActive: false }, sup)
    rec('super-admin', 'update plan/status', patched.status === 200)
    const sub = await prisma.schoolSubscription.findUnique({ where: { schoolId: newSchoolId } })
    rec('super-admin', 'plan limits applied', sub?.maxStudents === 1000, `maxStudents ${sub?.maxStudents}`)
    await prisma.invoicePayment.deleteMany({ where: { invoice: { schoolId: newSchoolId } } })
    await prisma.invoice.deleteMany({ where: { schoolId: newSchoolId } })
    await prisma.auditLog.deleteMany({ where: { schoolId: newSchoolId } })
    await prisma.schoolSubscription.deleteMany({ where: { schoolId: newSchoolId } })
    await prisma.school.delete({ where: { id: newSchoolId } })
  }
}

console.log('\n=== PARENT PORTAL ===')
{
  const par = await login('parent@kilimanjaro.tz', 'parent123')
  const r = await fetch(`${B}/dashboard/parents`, { headers: { Cookie: par } })
  const html = await r.text()
  rec('parents', 'portal renders for PARENT', r.status === 200)
  rec('parents', 'shows child data', /Baraka|Chiku/.test(html), 'children named in page')
}

console.log('\n=== ACCESS CHECK: guardians directory ===')
{
  // Can a non-parent role read the guardian contact directory?
  const s = await prisma.school.findFirst()
  await prisma.user.deleteMany({ where: { email: 'revstudent@kilimanjaro.tz' } })
  await prisma.user.create({ data: { email: 'revstudent@kilimanjaro.tz', name: 'Rev Student', role: 'STUDENT', schoolId: s.id, emailVerified: new Date(), hashedPassword: await bcrypt.hash('revpass123', 12) } })
  const stu = await login('revstudent@kilimanjaro.tz', 'revpass123')
  const r = await fetch(`${B}/dashboard/parents`, { headers: { Cookie: stu }, redirect: 'manual' })
  const html = r.status === 200 ? await r.text() : ''
  const leaks = /Guardians Directory|guardian/i.test(html)
  rec('parents', 'STUDENT blocked from guardian directory', !(r.status === 200 && leaks), `status ${r.status}${leaks ? ', directory VISIBLE' : ''}`)
  await prisma.user.deleteMany({ where: { email: 'revstudent@kilimanjaro.tz' } })
}

await prisma.attendance.deleteMany({ where: { studentId: student.id } })
await prisma.roomAssignment.deleteMany({ where: { studentId: student.id } })
await prisma.studentRoute.deleteMany({ where: { studentId: student.id } })
await prisma.bookIssue.deleteMany({ where: { studentId: student.id } })
// Receipts post to the ledger; remove those journal entries first or they linger as orphans.
const fixturePayments = (await prisma.feePayment.findMany({ where: { studentId: student.id }, select: { id: true } })).map((p) => p.id)
if (fixturePayments.length) { const je = (await prisma.journalEntry.findMany({ where: { source: 'FEE', sourceId: { in: fixturePayments } }, select: { id: true } })).map((e) => e.id); if (je.length) { await prisma.journalLine.deleteMany({ where: { entryId: { in: je } } }); await prisma.journalEntry.deleteMany({ where: { id: { in: je } } }) } }
await prisma.feePayment.deleteMany({ where: { studentId: student.id } })
await prisma.examResult.deleteMany({ where: { studentId: student.id } })
await prisma.student.deleteMany({ where: { id: student.id } })
console.log('\nfixture student removed')

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks OK`)
if (failed.length) {
  console.log('\nFAILURES:')
  for (const f of failed) console.log(`  ${f.module}: ${f.check}${f.note ? ` (${f.note})` : ''}`)
}
await prisma.$disconnect()
