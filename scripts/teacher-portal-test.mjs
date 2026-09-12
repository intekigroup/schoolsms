// Teacher portal: staff logins, teaching load, class leaders, and scoping of every teacher-facing page/API.
//   node scripts/teacher-portal-test.mjs [baseUrl]

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
  const r = await fetch(`${B}/api/auth/callback/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }), redirect: 'manual' })
  keep(r); const out = cookie(); return out.includes('session-token') ? out : null
}
const api = async (path, cookie, init = {}) => {
  const r = await fetch(B + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) }, redirect: 'manual' })
  const type = r.headers.get('content-type') ?? ''
  const body = type.includes('json') ? await r.json().catch(() => ({})) : type.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : await r.text()
  return { status: r.status, type, body, location: r.headers.get('location') }
}
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: { Cookie: cookie }, redirect: 'manual' }); return { status: r.status, html: await r.text(), location: r.headers.get('location') } }

// ─── Fixtures ────────────────────────────────────────────────────────────────
const school = await prisma.school.findUnique({ where: { id: 'school-kilimanjaro' } })
const TAG = 'TPT'
async function cleanup() {
  const staff = (await prisma.staff.findMany({ where: { schoolId: school.id, employeeNo: { startsWith: `${TAG}-` } }, select: { id: true, userId: true } }))
  const users = [...new Set([...staff.map((s) => s.userId).filter(Boolean), ...(await prisma.user.findMany({ where: { OR: [{ email: { contains: `.${TAG.toLowerCase()}@` } }, { email: { startsWith: `${TAG.toLowerCase()}-` } }] }, select: { id: true } })).map((u) => u.id)])]
  const classes = (await prisma.class.findMany({ where: { schoolId: school.id, name: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((c) => c.id)
  const students = (await prisma.student.findMany({ where: { schoolId: school.id, admissionNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)
  const subjects = (await prisma.subject.findMany({ where: { schoolId: school.id, name: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((s) => s.id)
  if (classes.length) {
    await prisma.class.updateMany({ where: { id: { in: classes } }, data: { monitorId: null, monitressId: null, classTeacherId: null } })
    await prisma.examResult.deleteMany({ where: { exam: { classId: { in: classes } } } })
    await prisma.exam.deleteMany({ where: { classId: { in: classes } } })
    await prisma.timetableSlot.deleteMany({ where: { classId: { in: classes } } })
    await prisma.attendance.deleteMany({ where: { classId: { in: classes } } })
    await prisma.classSubject.deleteMany({ where: { classId: { in: classes } } })
  }
  if (students.length) { await prisma.reportRemark.deleteMany({ where: { studentId: { in: students } } }); await prisma.student.deleteMany({ where: { id: { in: students } } }) }
  if (classes.length) await prisma.class.deleteMany({ where: { id: { in: classes } } })
  if (subjects.length) await prisma.subject.deleteMany({ where: { id: { in: subjects } } })
  if (staff.length) await prisma.staff.deleteMany({ where: { id: { in: staff.map((s) => s.id) } } })
  if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } }); await prisma.notification.deleteMany({ where: { userId: { in: users } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }) }
}
await cleanup()

const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id }, include: { terms: { orderBy: { startDate: 'asc' } } } })
const term = year.terms[1]
const clsA = await prisma.class.create({ data: { name: `Form 1 ${TAG}`, level: 'O_LEVEL', schoolId: school.id } })
const clsB = await prisma.class.create({ data: { name: `Form 2 ${TAG}`, level: 'O_LEVEL', schoolId: school.id } })
const clsC = await prisma.class.create({ data: { name: `Form 3 ${TAG}`, level: 'O_LEVEL', schoolId: school.id } })
const maths = await prisma.subject.create({ data: { name: `Maths ${TAG}`, schoolId: school.id } })
const kisw = await prisma.subject.create({ data: { name: `Kiswahili ${TAG}`, schoolId: school.id } })
const mk = async (cls, i, gender) => prisma.student.create({ data: { admissionNo: `${TAG}-${cls.name.slice(5, 6)}${i}`, firstName: `P${i}`, lastName: cls.name.replace(' ', ''), gender, dateOfBirth: new Date('2012-01-01'), schoolId: school.id, classId: cls.id } })
const a1 = await mk(clsA, 1, 'MALE'), a2 = await mk(clsA, 2, 'FEMALE'), b1 = await mk(clsB, 1, 'MALE'), c1 = await mk(clsC, 1, 'FEMALE')
const mwalimu = await prisma.staff.create({ data: { employeeNo: `${TAG}-T1`, firstName: 'Mwalimu', lastName: `Test${TAG}`, gender: 'MALE', role: 'Teacher', schoolId: school.id } })
const bursar = await prisma.staff.create({ data: { employeeNo: `${TAG}-B1`, firstName: 'Bursar', lastName: `Test${TAG}`, gender: 'FEMALE', role: 'Bursar', schoolId: school.id } })
const admin = await login('admin@kilimanjaro.tz', 'admin123')
ck('admin login', !!admin, true)

try {
  console.log('\nStaff logins')
  let r = await api('/api/teachers/account', admin, { method: 'POST', body: JSON.stringify({ staffId: mwalimu.id }) })
  ck('create teacher login 200', r.status, 200)
  ck('  default email from employee no', r.body.email, `${TAG.toLowerCase()}-t1@staff.local`)
  ck('  role guessed TEACHER', r.body.role, 'TEACHER')
  ck('  temp password returned once', typeof r.body.password === 'string' && r.body.password.length >= 10, true)
  const pw1 = r.body.password
  r = await api('/api/teachers/account', admin, { method: 'POST', body: JSON.stringify({ staffId: mwalimu.id }) })
  ck('second login refused 409', r.status, 409)
  r = await api('/api/teachers/account', admin, { method: 'POST', body: JSON.stringify({ staffId: bursar.id, email: `bursar.${TAG.toLowerCase()}@school.tz` }) })
  ck('bursar → ACCOUNTANT by job title', r.body.role, 'ACCOUNTANT')
  let teach = await login(`${TAG.toLowerCase()}-t1@staff.local`, pw1)
  ck('teacher can sign in with the temporary password', !!teach, true)
  r = await api('/api/teachers/account', admin, { method: 'PUT', body: JSON.stringify({ staffId: mwalimu.id }) })
  ck('password reset 200', r.status, 200)
  ck('  old session ended (tokenVersion bump)', (await api('/api/notifications', teach)).status, 401)
  teach = await login(`${TAG.toLowerCase()}-t1@staff.local`, r.body.password)
  ck('  new password works', !!teach, true)
  r = await api('/api/teachers/account', teach, { method: 'POST', body: JSON.stringify({ staffId: bursar.id }) })
  ck('teacher cannot provision logins 403', r.status, 403)

  console.log('\nTeacher with no teaching load')
  r = await page('/dashboard', teach)
  ck('teacher home renders (200), not the admin dashboard', r.status === 200 && r.html.includes('Habari') && !r.html.includes('Fees Collected'), true)
  ck('  says no classes assigned', r.html.includes('No classes assigned yet'), true)
  r = await api('/api/students', teach)
  ck('students API: empty until assigned', Array.isArray(r.body) && r.body.length === 0, true)
  r = await api(`/api/attendance?classId=${clsA.id}&date=2031-03-03`, teach)
  ck('attendance for an unassigned class 403', r.status, 403)
  r = await api('/api/settings/reports', teach)
  ck('settings no longer readable by teachers 403', r.status, 403)
  r = await api('/api/students/account', teach, { method: 'POST', body: JSON.stringify({ studentId: a1.id }) })
  ck('teacher cannot provision pupil logins 403', r.status, 403)
  r = await api('/api/students', teach, { method: 'POST', body: JSON.stringify({ firstName: 'X', lastName: 'Y', admissionNo: 'X-1' }) })
  ck('teacher cannot create pupils 403', r.status, 403)

  console.log('\nTeaching load & class leaders')
  r = await api('/api/teachers/assignments', admin, { method: 'PATCH', body: JSON.stringify({ staffId: mwalimu.id, classTeacherOf: clsA.id }) })
  ck('make class teacher of Form 1', r.status, 200)
  r = await api('/api/teachers/assignments', admin, { method: 'POST', body: JSON.stringify({ staffId: mwalimu.id, subjectId: maths.id, classId: clsB.id }) })
  ck('assign Maths in Form 2', r.status, 200)
  const asgMaths = r.body.item.id
  r = await api('/api/teachers/assignments', admin, { method: 'POST', body: JSON.stringify({ staffId: mwalimu.id, subjectId: maths.id, classId: clsB.id }) })
  ck('duplicate assignment 409', r.status, 409)
  r = await api(`/api/teachers/assignments?staffId=${mwalimu.id}`, admin)
  ck('load lists class teacher + 1 subject', `${r.body.classTeacherOf?.name}/${r.body.assignments.length}`, `Form 1 ${TAG}/1`)
  r = await api('/api/classes', admin, { method: 'PATCH', body: JSON.stringify({ id: clsA.id, monitorId: a1.id, monitressId: a2.id }) })
  ck('set monitor (boy) and monitress (girl) 200', r.status, 200)
  r = await api('/api/classes', admin, { method: 'PATCH', body: JSON.stringify({ id: clsA.id, monitorId: a2.id }) })
  ck('a girl as monitor refused 400', r.status, 400)
  r = await api('/api/classes', admin, { method: 'PATCH', body: JSON.stringify({ id: clsA.id, monitressId: b1.id }) })
  ck('pupil from another class refused 400', r.status, 400)
  r = await api('/api/classes', admin, { method: 'PATCH', body: JSON.stringify({ id: clsB.id, classTeacherId: mwalimu.id }) })
  ck('class teacher via Classes page moves the teacher (one class each)', r.status, 200)
  const nowA = await prisma.class.findUnique({ where: { id: clsA.id }, select: { classTeacherId: true, monitorId: true, monitressId: true } })
  ck('  Form 1 no longer has him; leaders kept', `${nowA.classTeacherId}/${nowA.monitorId === a1.id}/${nowA.monitressId === a2.id}`, 'null/true/true')
  await api('/api/classes', admin, { method: 'PATCH', body: JSON.stringify({ id: clsB.id, classTeacherId: null }) })
  await api('/api/teachers/assignments', admin, { method: 'PATCH', body: JSON.stringify({ staffId: mwalimu.id, classTeacherOf: clsA.id }) })
  r = await page('/dashboard/classes', admin)
  ck('classes page shows the leaders', r.html.includes('P1 Form1 TPT') && r.html.includes('P2 Form1 TPT'), true)

  console.log('\nScoped views (class teacher of Form 1, Maths in Form 2)')
  r = await api('/api/students', teach)
  ck('students API: Form 1 + Form 2 pupils only (3)', r.body.length, 3)
  ck('  Form 3 pupil not visible', r.body.some((s) => s.id === c1.id), false)
  r = await page('/dashboard/students', teach)
  ck('students page: no Add Student button, no login provisioning', !r.html.includes('Add Student') && !r.html.includes('Create login'), true)
  r = await page('/dashboard/classes', teach)
  ck('classes page: two classes, no Add Class', r.html.includes(`Form 1 ${TAG}`) && r.html.includes(`Form 2 ${TAG}`) && !r.html.includes(`Form 3 ${TAG}`) && !r.html.includes('Add Class'), true)
  r = await page('/dashboard', teach)
  ck('teacher home lists his classes and register button', r.html.includes(`Form 1 ${TAG}`) && r.html.includes('Mark register'), true)
  r = await api('/api/attendance', teach, { method: 'POST', body: JSON.stringify({ entries: [{ studentId: a1.id, status: 'PRESENT', date: '2031-03-03' }] }) })
  ck('mark attendance in own class', r.status === 200 ? 200 : `${r.status} ${JSON.stringify(r.body).slice(0, 80)}`, 200)
  r = await api('/api/attendance', teach, { method: 'POST', body: JSON.stringify({ entries: [{ studentId: c1.id, status: 'PRESENT', date: '2031-03-03' }] }) })
  ck('mark attendance in Form 3 403', r.status, 403)
  r = await api(`/api/attendance?classId=${clsB.id}&date=2031-03-03`, teach)
  ck('read register of a taught class 200', r.status, 200)

  console.log('\nExams & marks')
  r = await api('/api/exams', teach, { method: 'POST', body: JSON.stringify({ name: 'CAT 1', type: 'CAT', classId: clsB.id, subjectId: maths.id, academicYearId: year.id, termId: term.id, totalMarks: 50 }) })
  ck('create exam for Maths in Form 2', r.status, 200)
  const exam = r.body
  r = await api('/api/exams', teach, { method: 'POST', body: JSON.stringify({ name: 'CAT 1', type: 'CAT', classId: clsB.id, subjectId: kisw.id, academicYearId: year.id, termId: term.id }) })
  ck('Kiswahili in Form 2 refused 403', r.status, 403)
  r = await api('/api/exams', teach, { method: 'POST', body: JSON.stringify({ name: 'CAT 1', type: 'CAT', classId: clsA.id, subjectId: kisw.id, academicYearId: year.id, termId: term.id }) })
  ck('any subject in own class (class teacher) 200', r.status, 200)
  const examA = r.body
  r = await api('/api/exams', teach, { method: 'POST', body: JSON.stringify({ name: 'CAT 1', type: 'CAT', classId: clsC.id, subjectId: maths.id, academicYearId: year.id, termId: term.id }) })
  ck('Maths in Form 3 refused 403', r.status, 403)
  r = await api('/api/exams/results', teach, { method: 'POST', body: JSON.stringify({ examId: exam.id, results: [{ studentId: b1.id, marks: 40 }] }) })
  ck('enter marks for own exam 200', r.status, 200)
  const adminExam = await prisma.exam.create({ data: { name: 'Admin exam', type: 'CAT', classId: clsC.id, subjectId: maths.id, academicYearId: year.id, termId: term.id } })
  r = await api('/api/exams/results', teach, { method: 'POST', body: JSON.stringify({ examId: adminExam.id, results: [{ studentId: c1.id, marks: 40 }] }) })
  ck('marks for a Form 3 exam 403', r.status, 403)
  r = await api(`/api/exams/results?examId=${adminExam.id}`, teach)
  ck('read Form 3 mark sheet 403', r.status, 403)
  r = await page('/dashboard/exams', teach)
  ck('exams page hides the Form 3 exam', r.html.includes('CAT 1') && !r.html.includes('Admin exam'), true)
  r = await page('/dashboard', teach)
  ck('teacher home: incomplete mark sheet flagged', r.html.includes('Mark sheets incomplete'), true)

  console.log('\nResults, remarks, report cards')
  r = await api(`/api/reports/academic?classId=${clsA.id}&termId=${term.id}`, teach)
  ck('class results for own class 200', r.status, 200)
  r = await api(`/api/reports/academic?classId=${clsC.id}&termId=${term.id}`, teach)
  ck('class results for Form 3 403', r.status, 403)
  r = await api('/api/reports/remarks', teach, { method: 'PUT', body: JSON.stringify({ termId: term.id, remarks: [{ studentId: a1.id, classTeacherRemark: 'Good term', conduct: 'Good' }] }) })
  ck('class-teacher remark for own class 200', r.status, 200)
  r = await api('/api/reports/remarks', teach, { method: 'PUT', body: JSON.stringify({ termId: term.id, remarks: [{ studentId: a1.id, headTeacherRemark: 'I am the head' }] }) })
  ck('head-teacher remark by a teacher 403', r.status, 403)
  r = await api('/api/reports/remarks', teach, { method: 'PUT', body: JSON.stringify({ termId: term.id, remarks: [{ studentId: b1.id, classTeacherRemark: 'Not my class' }] }) })
  ck('remark for a taught-but-not-class-teacher class 403', r.status, 403)
  r = await api(`/api/reports/report-card?studentId=${a1.id}&termId=${term.id}`, teach)
  ck('report card for own pupil 200 pdf', `${r.status}/${r.type.includes('pdf')}`, '200/true')
  r = await api(`/api/reports/report-card?studentId=${c1.id}&termId=${term.id}`, teach)
  ck('report card for Form 3 pupil 403', r.status, 403)

  console.log('\nTimetable, parents, ID cards')
  await prisma.timetableSlot.create({ data: { classId: clsC.id, dayOfWeek: 1, startTime: '08:00', endTime: '08:40', subjectId: maths.id, staffId: mwalimu.id } })
  r = await api('/api/students', teach)
  ck('a timetable slot opens that class too (4 pupils now)', r.body.length, 4)
  r = await page('/dashboard/timetable', teach)
  ck('timetable page read-only for teachers (My week, no subject tray)', r.html.includes('My week') && r.html.includes('Your own lessons are outlined') && !r.html.includes('drag into the grid'), true)
  r = await page('/dashboard/parents', teach)
  ck('parents directory renders for teacher', r.status, 200)
  r = await api('/api/id-cards?type=student&classId=' + clsA.id, teach)
  ck('ID cards stay admin-only 403', r.status, 403)
  r = await api('/api/hr/leave?year=2031', teach)
  ck('HR self-service works via the linked staff record', r.status, 200)

  console.log('\nRevoke')
  r = await api(`/api/teachers/account?staffId=${mwalimu.id}`, admin, { method: 'DELETE' })
  ck('remove login 200', r.status, 200)
  ck('  session dead', (await api('/api/students', teach)).status, 401)
  ck('  cannot sign in again', await login(`${TAG.toLowerCase()}-t1@staff.local`, pw1), null)
  const audit = await prisma.auditLog.count({ where: { schoolId: school.id, entity: { in: ['StaffLogin', 'StaffSubject'] } } })
  ck('audit trail for logins and assignments', audit >= 5, true)
  void asgMaths
} finally {
  await cleanup()
  await prisma.$disconnect()
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
