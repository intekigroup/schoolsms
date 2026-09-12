// Marks workflow: draft → submit → review (return/publish) → lock/reopen; what parents, pupils and report cards see.
//   node scripts/marks-workflow-test.mjs [baseUrl]

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('../node_modules/bcryptjs')
const { PDFDocument, decodePDFRawStream, PDFRawStream } = require('../node_modules/pdf-lib')
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
async function pdfText(bytes) {
  const doc = await PDFDocument.load(bytes); let out = ''
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (!(obj instanceof PDFRawStream)) return
    let s; try { s = Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1') } catch { return }
    for (const m of s.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += Buffer.from(m[1], 'hex').toString('latin1') + '\n'
  })
  return out
}
const api = async (path, cookie, init = {}) => {
  const r = await fetch(B + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) }, redirect: 'manual' })
  const type = r.headers.get('content-type') ?? ''
  const body = type.includes('json') ? await r.json().catch(() => ({})) : type.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : await r.text()
  return { status: r.status, type, body }
}
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: { Cookie: cookie } }); return { status: r.status, html: await r.text() } }

const school = await prisma.school.findUnique({ where: { id: 'school-kilimanjaro' } })
const TAG = 'MWF'
async function cleanup() {
  const staff = await prisma.staff.findMany({ where: { schoolId: school.id, employeeNo: { startsWith: `${TAG}-` } }, select: { id: true } })
  const users = (await prisma.user.findMany({ where: { OR: [{ email: { startsWith: `${TAG.toLowerCase()}-` } }, { email: { endsWith: `.${TAG.toLowerCase()}@x.tz` } }] }, select: { id: true } })).map((u) => u.id)
  const classes = (await prisma.class.findMany({ where: { schoolId: school.id, name: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((c) => c.id)
  const students = (await prisma.student.findMany({ where: { schoolId: school.id, admissionNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)
  const guardians = (await prisma.guardian.findMany({ where: { lastName: `Test${TAG}` }, select: { id: true } })).map((g) => g.id)
  const subjects = (await prisma.subject.findMany({ where: { schoolId: school.id, name: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((s) => s.id)
  if (classes.length) { await prisma.class.updateMany({ where: { id: { in: classes } }, data: { classTeacherId: null } }); await prisma.examResult.deleteMany({ where: { exam: { classId: { in: classes } } } }); await prisma.exam.deleteMany({ where: { classId: { in: classes } } }) }
  if (students.length) { await prisma.studentGuardian.deleteMany({ where: { studentId: { in: students } } }); await prisma.reportRemark.deleteMany({ where: { studentId: { in: students } } }); await prisma.student.deleteMany({ where: { id: { in: students } } }) }
  if (guardians.length) await prisma.guardian.deleteMany({ where: { id: { in: guardians } } })
  if (classes.length) await prisma.class.deleteMany({ where: { id: { in: classes } } })
  if (subjects.length) await prisma.subject.deleteMany({ where: { id: { in: subjects } } })
  if (staff.length) await prisma.staff.deleteMany({ where: { id: { in: staff.map((s) => s.id) } } })
  if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } }); await prisma.notification.deleteMany({ where: { userId: { in: users } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }) }
}
await cleanup()

const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id }, include: { terms: { orderBy: { startDate: 'asc' } } } })
const term = year.terms[2]
const cls = await prisma.class.create({ data: { name: `Form 1 ${TAG}`, level: 'O_LEVEL', schoolId: school.id } })
const maths = await prisma.subject.create({ data: { name: `Maths ${TAG}`, schoolId: school.id } })
const p1 = await prisma.student.create({ data: { admissionNo: `${TAG}-1`, firstName: 'Neema', lastName: `Test${TAG}`, gender: 'FEMALE', dateOfBirth: new Date('2012-01-01'), schoolId: school.id, classId: cls.id } })
const p2 = await prisma.student.create({ data: { admissionNo: `${TAG}-2`, firstName: 'Omari', lastName: `Test${TAG}`, gender: 'MALE', dateOfBirth: new Date('2012-01-01'), schoolId: school.id, classId: cls.id } })
const pupilUser = await prisma.user.create({ data: { email: `${TAG.toLowerCase()}-neema@staff.local`, name: 'Neema', role: 'STUDENT', hashedPassword: await bcrypt.hash('p123', 10), schoolId: school.id, emailVerified: new Date(), student: { connect: { id: p1.id } } } })
const guardianUser = await prisma.user.create({ data: { email: `mama.${TAG.toLowerCase()}@x.tz`, name: 'Mama', role: 'PARENT', hashedPassword: await bcrypt.hash('g123', 10), schoolId: school.id, emailVerified: new Date() } })
const guardian = await prisma.guardian.create({ data: { firstName: 'Mama', lastName: `Test${TAG}`, phone: '+255700000999', userId: guardianUser.id } })
await prisma.studentGuardian.create({ data: { studentId: p1.id, guardianId: guardian.id, isPrimary: true } })
const staff = await prisma.staff.create({ data: { employeeNo: `${TAG}-T1`, firstName: 'Mwalimu', lastName: `Test${TAG}`, gender: 'MALE', role: 'Teacher', schoolId: school.id } })
const teacherUser = await prisma.user.create({ data: { email: `${TAG.toLowerCase()}-t1@staff.local`, name: 'Mwalimu', role: 'TEACHER', hashedPassword: await bcrypt.hash('t123', 10), schoolId: school.id, emailVerified: new Date() } })
await prisma.staff.update({ where: { id: staff.id }, data: { userId: teacherUser.id } })
await prisma.staffSubject.create({ data: { staffId: staff.id, subjectId: maths.id, classId: cls.id } })

const admin = await login('admin@kilimanjaro.tz', 'admin123')
const teach = await login(teacherUser.email, 't123')
const pupil = await login(pupilUser.email, 'p123')
const parent = await login(guardianUser.email, 'g123')
ck('logins', !!admin && !!teach && !!pupil && !!parent, true)
const notifCount = async (cookie) => (await api('/api/notifications', cookie)).body?.unread ?? 0 // the list is paginated; unread is a true count

try {
  console.log('\nDraft → submit')
  let r = await api('/api/exams', teach, { method: 'POST', body: JSON.stringify({ name: 'End of term', type: 'END_OF_TERM', classId: cls.id, subjectId: maths.id, academicYearId: year.id, termId: term.id, totalMarks: 100 }) })
  ck('teacher creates the exam (DRAFT)', `${r.status}/${r.body.status}`, '200/DRAFT')
  const exam = r.body
  r = await api('/api/exams/results', teach, { method: 'POST', body: JSON.stringify({ examId: exam.id, results: [{ studentId: p1.id, marks: 82 }] }) })
  ck('teacher enters one of two marks', r.status, 200)
  r = await api(`/api/exams/results?examId=${exam.id}`, teach)
  ck('mark sheet reports status and 1 missing', `${r.body.status}/${r.body.missing}`, 'DRAFT/1')
  r = await api('/api/exams/workflow', teach, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'submit' }) })
  ck('submit with a missing mark → 409 naming the count', `${r.status}/${r.body.missing}`, '409/1')
  r = await api('/api/exams/results', teach, { method: 'POST', body: JSON.stringify({ examId: exam.id, results: [{ studentId: p2.id, marks: 47 }] }) })
  const before = await notifCount(admin)
  r = await api('/api/exams/workflow', teach, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'submit' }) })
  ck('submit when complete → SUBMITTED', `${r.status}/${r.body.exam.status}`, '200/SUBMITTED')
  ck('  office notified', (await notifCount(admin)) > before, true)
  r = await api('/api/exams/results', teach, { method: 'POST', body: JSON.stringify({ examId: exam.id, results: [{ studentId: p1.id, marks: 90 }] }) })
  ck('teacher cannot edit a submitted sheet (409 locked)', `${r.status}/${r.body.locked}`, '409/true')
  r = await api('/api/exams/results', admin, { method: 'POST', body: JSON.stringify({ examId: exam.id, results: [{ studentId: p1.id, marks: 85 }] }) })
  ck('office may still correct a submitted sheet', r.status, 200)
  r = await api('/api/exams/workflow', teach, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'publish' }) })
  ck('teacher cannot publish 403', r.status, 403)

  console.log('\nNot yet published: invisible to parents, pupils and report cards')
  r = await page('/dashboard/my', pupil)
  ck('pupil portal shows no marks yet', r.html.includes('85') && r.html.includes(`Maths ${TAG}`), false)
  r = await page('/dashboard/parents', parent)
  ck('parent portal shows no marks yet', r.html.includes(`Maths ${TAG}`), false)
  r = await api(`/api/reports/report-card?studentId=${p1.id}&termId=${term.id}`, admin)
  let txt = await pdfText(r.body)
  ck('report card: no assessments yet', txt.includes('No assessments recorded'), true)
  r = await api(`/api/reports/academic?classId=${cls.id}&termId=${term.id}`, admin)
  ck('staff class results preview includes it, flagged unpublished=1', `${r.body.unpublished}/${r.body.pupils.find((p) => p.studentId === p1.id).average}`, '1/85')
  r = await api(`/api/reports/academic?classId=${cls.id}&termId=${term.id}&published=1`, admin)
  ck('  published-only view: no subjects', r.body.subjects.length, 0)

  console.log('\nReturn → fix → resubmit → publish')
  const tBefore = await notifCount(teach)
  r = await api('/api/exams/workflow', admin, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'reject', note: 'Omari sat the paper, check his script' }) })
  ck('office returns the sheet → DRAFT with note', `${r.body.exam.status}/${r.body.exam.reviewNote}`, 'DRAFT/Omari sat the paper, check his script')
  ck('  teacher notified', (await notifCount(teach)) > tBefore, true)
  r = await api('/api/exams/results', teach, { method: 'POST', body: JSON.stringify({ examId: exam.id, results: [{ studentId: p2.id, marks: 52 }] }) })
  ck('teacher can edit again', r.status, 200)
  await api('/api/exams/workflow', teach, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'submit' }) })
  const pBefore = await notifCount(parent), sBefore = await notifCount(pupil)
  r = await api('/api/exams/workflow', admin, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'publish' }) })
  ck('office publishes → PUBLISHED', `${r.status}/${r.body.exam.status}`, '200/PUBLISHED')
  ck('  parent and pupil notified', (await notifCount(parent)) > pBefore && (await notifCount(pupil)) > sBefore, true)
  r = await api('/api/exams/results', admin, { method: 'POST', body: JSON.stringify({ examId: exam.id, results: [{ studentId: p1.id, marks: 99 }] }) })
  ck('published sheet is locked even for the office (409)', `${r.status}/${r.body.locked}`, '409/true')

  console.log('\nPublished: visible everywhere')
  r = await page('/dashboard/my', pupil)
  ck('pupil portal shows the mark', r.html.includes(`Maths ${TAG}`) && r.html.includes('85'), true)
  r = await page('/dashboard/parents', parent)
  ck('parent portal shows the subject', r.html.includes(`Maths ${TAG}`), true)
  r = await api(`/api/reports/report-card?studentId=${p1.id}&termId=${term.id}`, admin)
  txt = await pdfText(r.body)
  ck('report card carries the mark (85.0, A)', txt.includes('85.0') && txt.includes(`Maths ${TAG}`), true)
  r = await api(`/api/reports/academic?classId=${cls.id}&termId=${term.id}`, admin)
  ck('class results: unpublished 0', r.body.unpublished, 0)

  console.log('\nReopen, board, bulk publish')
  r = await api('/api/exams/workflow', admin, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'reopen', note: 'Marking error on Q4' }) })
  ck('office reopens → DRAFT', r.body.exam.status, 'DRAFT')
  r = await api(`/api/reports/report-card?studentId=${p1.id}&termId=${term.id}`, admin)
  txt = await pdfText(r.body)
  ck('  report card no longer shows it', txt.includes('No assessments recorded'), true)
  r = await api('/api/exams/workflow', admin, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'publish' }) })
  ck('publish an unsubmitted draft → 409 unsubmitted', `${r.status}/${r.body.unsubmitted}`, '409/true')
  r = await api('/api/exams/workflow', admin, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'publish', force: true }) })
  ck('  force publishes', r.body.exam.status, 'PUBLISHED')
  await api('/api/exams/workflow', admin, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'reopen' }) })
  await api('/api/exams/workflow', teach, { method: 'PATCH', body: JSON.stringify({ examId: exam.id, action: 'submit' }) })
  r = await api('/api/exams', teach, { method: 'POST', body: JSON.stringify({ name: 'CAT 2', type: 'CAT', classId: cls.id, subjectId: maths.id, academicYearId: year.id, termId: term.id, totalMarks: 50 }) })
  const cat = r.body
  r = await api(`/api/exams/workflow?termId=${term.id}`, teach)
  const mine = r.body.exams.filter((e) => e.className === `Form 1 ${TAG}`)
  ck('board: 2 sheets, 1 submitted, 1 incomplete draft', `${mine.length}/${mine.filter((e) => e.status === 'SUBMITTED').length}/${mine.filter((e) => e.status === 'DRAFT' && e.entered < e.expected).length}`, '2/1/1')
  r = await api('/api/exams/workflow', teach, { method: 'PATCH', body: JSON.stringify({ termId: term.id, action: 'publish-term' }) })
  ck('teacher cannot bulk publish 403', r.status, 403)
  r = await api('/api/exams/workflow', admin, { method: 'PATCH', body: JSON.stringify({ termId: term.id, action: 'publish-term' }) })
  ck('office publishes every submitted sheet in the term (1)', r.body.published, 1)
  ck('  the incomplete draft stays a draft', (await prisma.exam.findUnique({ where: { id: cat.id } })).status, 'DRAFT')
  r = await page('/dashboard/exams', admin)
  ck('exams page shows the marks board and status badges', r.html.includes('Marks board') && r.html.includes('Published'), true)
  r = await page('/dashboard/exams', teach)
  ck('teacher page has Submit but no Publish', r.html.includes('>Submit<') && !r.html.includes('>Publish<'), true)
  const audit = await prisma.auditLog.count({ where: { schoolId: school.id, entity: 'Exam' } })
  ck('audit rows for the workflow', audit >= 7, true)
} finally {
  await cleanup()
  await prisma.$disconnect()
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
