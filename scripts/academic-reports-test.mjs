// Academic reports: settings, engine, remarks, PDFs, access.
//   node scripts/academic-reports-test.mjs [baseUrl]
//
// Builds a throwaway O-level class with known marks, then checks that the
// numbers the engine reports are the ones a head teacher would compute by
// hand, that every setting changes the output the way it says it does, and
// that the four PDFs carry the right text. Cleans up by explicit ids only.

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
  const r = await fetch(`${B}/api/auth/callback/credentials`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }), redirect: 'manual',
  })
  keep(r)
  const out = cookie()
  return out.includes('session-token') ? out : null
}

async function pdfText(bytes) {
  const doc = await PDFDocument.load(bytes)
  let out = ''
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (!(obj instanceof PDFRawStream)) return
    let stream
    try { stream = Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1') } catch { return }
    for (const m of stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += Buffer.from(m[1], 'hex').toString('latin1') + '\n'
  })
  return { text: out, pages: doc.getPageCount() }
}

const api = async (path, cookie, init = {}) => {
  const r = await fetch(B + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) } })
  const type = r.headers.get('content-type') ?? ''
  const body = type.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : await r.json().catch(() => ({}))
  return { status: r.status, type, body, disposition: r.headers.get('content-disposition') }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
const school = await prisma.school.findUnique({ where: { id: 'school-kilimanjaro' } })
const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id }, include: { terms: { orderBy: { startDate: 'asc' } } } })
const term = year.terms[1] // Term 2
const TAG = 'ART' // academic-reports-test
const ids = { students: [], exams: [], subjects: [], users: [], class: null, otherSchool: null, otherClass: null }

async function cleanup() {
  // Discover leftovers by tag too, so a crashed run never blocks the next one.
  // Every delete is scoped to explicit ids — never an empty where.
  const lower = TAG.toLowerCase()
  const uniq = (a) => [...new Set(a)]
  const st = uniq([...ids.students, ...(await prisma.student.findMany({ where: { schoolId: school.id, admissionNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)])
  const users = uniq([...ids.users, ...(await prisma.user.findMany({ where: { email: { endsWith: `.${lower}@kilimanjaro.tz` } }, select: { id: true } })).map((u) => u.id)])
  const classes = uniq([...(ids.class ? [ids.class] : []), ...(await prisma.class.findMany({ where: { schoolId: school.id, name: `Form 3 ${TAG}` }, select: { id: true } })).map((c) => c.id)])
  const subjs = uniq([...ids.subjects, ...(await prisma.subject.findMany({ where: { schoolId: school.id, name: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((s) => s.id)])
  const others = uniq([...(ids.otherSchool ? [ids.otherSchool] : []), ...(await prisma.school.findMany({ where: { name: `Other ${TAG}` }, select: { id: true } })).map((s) => s.id)])
  if (st.length) {
    await prisma.reportRemark.deleteMany({ where: { studentId: { in: st } } })
    await prisma.examResult.deleteMany({ where: { studentId: { in: st } } })
    await prisma.attendance.deleteMany({ where: { studentId: { in: st } } })
    await prisma.student.deleteMany({ where: { id: { in: st } } })
  }
  // Fixture teacher (staff record linked to the teacher login) — unlink as class teacher, then remove.
  const staffIds = (await prisma.staff.findMany({ where: { schoolId: school.id, employeeNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((x) => x.id)
  if (staffIds.length) {
    await prisma.class.updateMany({ where: { classTeacherId: { in: staffIds } }, data: { classTeacherId: null } })
    await prisma.staff.deleteMany({ where: { id: { in: staffIds } } })
  }
  if (classes.length) {
    await prisma.examResult.deleteMany({ where: { exam: { classId: { in: classes } } } })
    await prisma.exam.deleteMany({ where: { classId: { in: classes } } })
    await prisma.class.deleteMany({ where: { id: { in: classes } } })
  }
  if (subjs.length) await prisma.subject.deleteMany({ where: { id: { in: subjs } } })
  if (users.length) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  }
  if (others.length) {
    await prisma.class.deleteMany({ where: { schoolId: { in: others } } })
    await prisma.schoolSubscription.deleteMany({ where: { schoolId: { in: others } } })
    await prisma.school.deleteMany({ where: { id: { in: others } } })
  }
  await prisma.reportSettings.deleteMany({ where: { schoolId: school.id } })
}
await cleanup()

const cls = await prisma.class.create({ data: { name: `Form 3 ${TAG}`, level: 'O_LEVEL', schoolId: school.id } })
ids.class = cls.id
const subjectNames = ['Mathematics', 'English', 'Kiswahili', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography']
const subjects = []
for (const n of subjectNames) {
  const s = await prisma.subject.create({ data: { name: `${n} ${TAG}`, code: `${n.slice(0, 3).toUpperCase()}-${TAG}`, schoolId: school.id } })
  subjects.push(s); ids.subjects.push(s.id)
}
// Three pupils: Amina (strong), Baraka (mid), Chausiku (weak, one subject missing).
const pupilsSpec = [
  { first: 'Amina', last: `Test${TAG}`, cat: 80, eot: 90 },   // 0.4*80+0.6*90 = 86 → A
  { first: 'Baraka', last: `Test${TAG}`, cat: 50, eot: 60 },  // 56 → C
  { first: 'Chausiku', last: `Test${TAG}`, cat: 20, eot: 30 }, // 26 → F
]
const pupils = []
for (const [i, p] of pupilsSpec.entries()) {
  const s = await prisma.student.create({ data: {
    admissionNo: `${TAG}-${i + 1}`, firstName: p.first, lastName: p.last, gender: 'FEMALE', dateOfBirth: new Date('2011-03-01'),
    schoolId: school.id, classId: cls.id, status: 'ACTIVE',
  } })
  pupils.push({ ...p, id: s.id }); ids.students.push(s.id)
}
// Attendance in the term for Amina: 9 present, 1 absent.
for (let d = 0; d < 10; d++) {
  await prisma.attendance.create({ data: { studentId: pupils[0].id, classId: cls.id, date: new Date(Date.UTC(2026, 4, 4 + d)), status: d === 9 ? 'ABSENT' : 'PRESENT' } })
}
// Exams: CAT (out of 50) and END_OF_TERM (out of 100) per subject.
for (const s of subjects) {
  for (const [type, total, key] of [['CAT', 50, 'cat'], ['END_OF_TERM', 100, 'eot']]) {
    const e = await prisma.exam.create({ data: { name: `${type} ${s.name}`, type, totalMarks: total, classId: cls.id, subjectId: s.id, academicYearId: year.id, termId: term.id, date: new Date('2026-07-01'), status: 'PUBLISHED' } })
    ids.exams.push(e.id)
    for (const p of pupils) {
      // Chausiku skipped Geography entirely.
      if (p.first === 'Chausiku' && s.name.startsWith('Geography')) continue
      await prisma.examResult.create({ data: { studentId: p.id, examId: e.id, subjectId: s.id, marks: (p[key] / 100) * total, grade: '?' } })
    }
  }
}
// A teacher account and a pupil account.
const teacher = await prisma.user.create({ data: { email: `teacher.${TAG.toLowerCase()}@kilimanjaro.tz`, name: 'Test Teacher', role: 'TEACHER', hashedPassword: await bcrypt.hash('teach123', 10), schoolId: school.id, emailVerified: new Date() } })
ids.users.push(teacher.id)
// Teachers only see their teaching load: make this one class teacher of the fixture class.
const teacherStaff = await prisma.staff.create({ data: { employeeNo: `${TAG}-T1`, firstName: 'Test', lastName: 'Teacher', gender: 'FEMALE', role: 'Teacher', schoolId: school.id, userId: teacher.id } })
await prisma.class.update({ where: { id: cls.id }, data: { classTeacherId: teacherStaff.id } })
const pupilUser = await prisma.user.create({ data: { email: `amina.${TAG.toLowerCase()}@kilimanjaro.tz`, name: 'Amina', role: 'STUDENT', hashedPassword: await bcrypt.hash('pupil123', 10), schoolId: school.id, emailVerified: new Date() } })
ids.users.push(pupilUser.id)
await prisma.student.update({ where: { id: pupils[0].id }, data: { userId: pupilUser.id } })
// Another school, for isolation.
const other = await prisma.school.create({ data: { name: `Other ${TAG}`, subscription: { create: { plan: 'FREE', maxStudents: 50, maxStaff: 10 } } } })
ids.otherSchool = other.id
const otherClass = await prisma.class.create({ data: { name: 'Form 1 Other', level: 'O_LEVEL', schoolId: other.id } })
ids.otherClass = otherClass.id

const admin = await login('admin@kilimanjaro.tz', 'admin123')
const teach = await login(teacher.email, 'teach123')
const pupil = await login(pupilUser.email, 'pupil123')
ck('logins', !!admin && !!teach && !!pupil, true)

try {
  // ─── Settings ──────────────────────────────────────────────────────────────
  console.log('\nSettings')
  let r = await api('/api/settings/reports', admin)
  ck('GET defaults 200', r.status, 200)
  ck('default scale is A75/B65/C45/D30/F0', r.body.config.scale.map((b) => `${b.grade}${b.min}`).join(''), 'A75B65C45D30F0')
  ck('default weights CAT 40 / EOT 60', `${r.body.config.weights.CAT}/${r.body.config.weights.END_OF_TERM}`, '40/60')
  ck('default divisions best of 7, I≤17', `${r.body.config.division.bestOf}/${r.body.config.division.bands[0].maxPoints}`, '7/17')
  r = await api('/api/settings/reports', null)
  ck('anonymous GET 401', r.status, 401)
  r = await api('/api/settings/reports', teach, { method: 'PUT', body: JSON.stringify({ config: r.body.config }) })
  ck('teacher cannot PUT (403)', r.status, 403)
  const defaults = (await api('/api/settings/reports', admin)).body.config
  r = await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, scale: [{ grade: 'A', min: 50, points: 1, remark: 'x' }, { grade: 'A', min: 0, points: 2, remark: 'y' }] } }) })
  ck('duplicate grade letters rejected 400', r.status, 400)
  r = await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, weights: { ...defaults.weights, CAT: 150 } } }) })
  ck('weight over 100 rejected 400', r.status, 400)
  ck('  …with a field path in the message', /weights\.CAT/.test(r.body.error), true)
  r = await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, scale: [{ grade: 'F', min: 0, points: 5, remark: 'Fail' }, { grade: 'A', min: 75, points: 1, remark: 'Excellent' }, { grade: 'B', min: 40, points: 2, remark: 'Good' }] } }) })
  ck('valid PUT 200', r.status, 200)
  ck('scale returned sorted highest first', r.body.config.scale.map((b) => b.grade).join(''), 'ABF')
  r = await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ reset: true }) })
  ck('reset restores defaults', r.body.config.scale.length, 5)

  // ─── Engine ────────────────────────────────────────────────────────────────
  console.log('\nEngine')
  const q = `classId=${cls.id}&termId=${term.id}`
  r = await api(`/api/reports/academic?${q}`, admin)
  ck('results JSON 200', r.status, 200)
  const res = r.body
  const amina = res.pupils.find((p) => p.name.startsWith('Amina'))
  const baraka = res.pupils.find((p) => p.name.startsWith('Baraka'))
  const chausiku = res.pupils.find((p) => p.name.startsWith('Chausiku'))
  ck('3 pupils, 8 subjects', `${res.pupils.length}/${res.subjects.length}`, '3/8')
  ck('Amina maths = 0.4·80 + 0.6·90 = 86', amina.subjects[0].pct, 86)
  ck('  grade A, 1 point', `${amina.subjects[0].grade}${amina.subjects[0].points}`, 'A1')
  ck('  basis names both assessments', amina.subjects[0].basis, 'CAT 40% · End of term 60%')
  ck('Baraka average 56 → C', `${baraka.average}/${baraka.subjects[0].grade}`, '56/C')
  ck('Chausiku 26 → F', `${chausiku.average}/${chausiku.subjects[0].grade}`, '26/F')
  ck('Chausiku took 7 of 8 (Geography missing)', chausiku.taken, 7)
  ck('  missing subject has null mark', chausiku.subjects.find((s) => s.subject.startsWith('Geography')).pct, null)
  ck('positions 1,2,3', [amina, baraka, chausiku].map((p) => p.position).join(''), '123')
  ck('Amina points best-of-7 = 7', amina.points, 7)
  ck('  division I', amina.division, 'I')
  ck('Baraka 3×7 = 21 → division II', `${baraka.points}/${baraka.division}`, '21/II')
  ck('Chausiku 5×7 = 35 → division 0', `${chausiku.points}/${chausiku.division}`, '35/0')
  ck('division tally I:1 II:1 0:1', `${res.divisions.I}/${res.divisions.II}/${res.divisions['0']}`, '1/1/1')
  ck('class average (86+56+26)/3 = 56', res.classAverage, 56)
  ck('maths mean 56, high 86, low 26', `${res.subjects[0].mean}/${res.subjects[0].highest}/${res.subjects[0].lowest}`, '56/86/26')
  ck('maths grade distribution A1 C1 F1', `${res.subjects[0].distribution.A}${res.subjects[0].distribution.C}${res.subjects[0].distribution.F}`, '111')
  ck('Amina attendance 90% (9 of 10)', `${amina.attendance.rate}/${amina.attendance.present}/${amina.attendance.total}`, '90/9/10')
  ck('Amina subject position 1', amina.subjects[0].position, 1)

  // Settings change the numbers.
  console.log('\nSettings drive the engine')
  await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, weights: { ...defaults.weights, CAT: 0, END_OF_TERM: 100 } } }) })
  r = await api(`/api/reports/academic?${q}`, admin)
  ck('EOT-only weighting: Amina maths = 90', r.body.pupils.find((p) => p.name.startsWith('Amina')).subjects[0].pct, 90)
  await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, ranking: { enabled: false, by: 'average' } } }) })
  r = await api(`/api/reports/academic?${q}`, admin)
  ck('ranking off → no positions', r.body.pupils.every((p) => p.position === null), true)
  await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, division: { ...defaults.division, enabled: false } } }) })
  r = await api(`/api/reports/academic?${q}`, admin)
  ck('divisions off → null', r.body.divisions === null && r.body.pupils[0].division === null, true)
  await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, scale: [{ grade: 'A', min: 80, points: 1, remark: 'Top' }, { grade: 'B', min: 50, points: 2, remark: 'Ok' }, { grade: 'C', min: 0, points: 3, remark: 'Low' }] } }) })
  r = await api(`/api/reports/academic?${q}`, admin)
  ck('custom 3-band scale: Baraka 56 → B', r.body.pupils.find((p) => p.name.startsWith('Baraka')).subjects[0].grade, 'B')
  ck('  Chausiku division uses new points (3×7=21 → II)', r.body.pupils.find((p) => p.name.startsWith('Chausiku')).division, 'II')
  // Mark entry uses the school scale too.
  const mathsCat = await prisma.exam.findFirst({ where: { id: { in: ids.exams }, type: 'CAT', subjectId: subjects[0].id } })
  // Published sheets are locked; reopen this one for the mark-entry check, then publish it again.
  await prisma.exam.update({ where: { id: mathsCat.id }, data: { status: 'DRAFT' } })
  r = await api('/api/exams/results', admin, { method: 'POST', body: JSON.stringify({ examId: mathsCat.id, results: [{ studentId: pupils[1].id, marks: 25 }] }) })
  const stored = await prisma.examResult.findUnique({ where: { studentId_examId: { studentId: pupils[1].id, examId: mathsCat.id } } })
  ck('mark entry grades on the school scale (25/50 = 50% → B)', stored.grade, 'B')
  await prisma.exam.update({ where: { id: mathsCat.id }, data: { status: 'PUBLISHED' } })
  await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ reset: true }) })

  // ─── Remarks ───────────────────────────────────────────────────────────────
  console.log('\nRemarks')
  r = await api('/api/reports/remarks', teach, { method: 'PUT', body: JSON.stringify({ termId: term.id, remarks: [
    { studentId: pupils[0].id, classTeacherRemark: 'Outstanding term, Amina.', conduct: 'Excellent' },
    { studentId: pupils[2].id, classTeacherRemark: '', conduct: 'Needs guidance' },
  ] }) })
  ck('teacher saves remarks 200', r.status, 200)
  ck('  2 saved', r.body.saved, 2)
  r = await api('/api/reports/remarks', teach, { method: 'PUT', body: JSON.stringify({ termId: term.id, remarks: [{ studentId: pupils[0].id, headTeacherRemark: 'Keep it up.' }] }) })
  ck('  head-teacher line is the office\'s (teacher 403)', r.status, 403)
  r = await api('/api/reports/remarks', admin, { method: 'PUT', body: JSON.stringify({ termId: term.id, remarks: [{ studentId: pupils[0].id, classTeacherRemark: 'Outstanding term, Amina.', headTeacherRemark: 'Keep it up.', conduct: 'Excellent' }] }) })
  ck('  admin writes the head-teacher line', r.status, 200)
  r = await api(`/api/reports/academic?${q}`, teach)
  ck('teacher reads results 200', r.status, 200)
  ck('remark appears in results', r.body.pupils.find((p) => p.name.startsWith('Amina')).remarks.classTeacher, 'Outstanding term, Amina.')
  ck('blank remark stored as null', r.body.pupils.find((p) => p.name.startsWith('Chausiku')).remarks.classTeacher, null)
  r = await api('/api/reports/remarks', teach, { method: 'PUT', body: JSON.stringify({ termId: term.id, remarks: [{ studentId: 'nope', classTeacherRemark: 'x' }] }) })
  ck('unknown pupil 404', r.status, 404)
  r = await api('/api/reports/remarks', pupil, { method: 'PUT', body: JSON.stringify({ termId: term.id, remarks: [{ studentId: pupils[0].id, classTeacherRemark: 'I am great' }] }) })
  ck('pupil cannot write remarks 403', r.status, 403)

  // ─── PDFs ──────────────────────────────────────────────────────────────────
  console.log('\nPDFs')
  r = await api(`/api/reports/academic?${q}&type=report-cards`, admin)
  ck('report cards PDF', r.type.includes('pdf'), true)
  let pdf = await pdfText(r.body)
  ck('  one page per pupil', pdf.pages, 3)
  ck('  carries the written remark', pdf.text.includes('Outstanding term, Amina.'), true)
  ck('  auto remark for Chausiku (F)', pdf.text.includes('serious concern'), true)
  ck('  shows division', /Division/.test(pdf.text) && pdf.text.includes('II'), true)
  ck('  shows position "1st of 3"', pdf.text.includes('1st of 3'), true)
  ck('  attendance 90%', pdf.text.includes('90%'), true)
  ck('  filename', r.disposition, `attachment; filename="report-cards-Form-3-${TAG}-Term-2.pdf"`)

  r = await api(`/api/reports/academic?${q}&type=class-sheet`, admin)
  pdf = await pdfText(r.body)
  ck('class sheet PDF', r.type.includes('pdf'), true)
  ck('  landscape page', (await PDFDocument.load(r.body)).getPage(0).getWidth() > 800, true)
  ck('  lists all three pupils', ['Amina', 'Baraka', 'Chausiku'].every((n) => pdf.text.includes(n)), true)
  ck('  cell "86A" for Amina maths', pdf.text.includes('86A'), true)

  r = await api(`/api/reports/academic?${q}&type=subject-analysis`, admin)
  pdf = await pdfText(r.body)
  ck('subject analysis lists 8 subjects', subjectNames.every((n) => pdf.text.includes(n)), true)

  r = await api(`/api/reports/academic?${q}&type=performance-summary`, admin)
  pdf = await pdfText(r.body)
  ck('performance summary has DIVISIONS block', pdf.text.includes('DIVISIONS (BEST 7 SUBJECTS)'), true)
  ck('  top of class lists Amina', pdf.text.includes('Amina'), true)

  r = await api(`/api/reports/academic?${q}&type=bogus`, admin)
  ck('unknown type 400', r.status, 400)

  // Switching a document off refuses it.
  await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, reports: { ...defaults.reports, classSheet: false } } }) })
  r = await api(`/api/reports/academic?${q}&type=class-sheet`, admin)
  ck('class sheet switched off → 403', r.status, 403)
  r = await api(`/api/reports/academic?${q}&type=report-cards`, admin)
  ck('  report cards still 200', r.status, 200)
  // Card layout options.
  await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, card: { ...defaults.card, showPosition: false, showAttendance: false, showSignatures: false, footerNote: 'Next term begins 7 September.' } } }) })
  r = await api(`/api/reports/academic?${q}&type=report-cards`, admin)
  pdf = await pdfText(r.body)
  ck('position hidden', pdf.text.includes('1st of 3'), false)
  ck('attendance hidden', pdf.text.includes('ATTENDANCE'), false)
  ck('signatures hidden', pdf.text.includes('Head teacher'), false)
  ck('footer note printed', pdf.text.includes('Next term begins 7 September.'), true)
  await api('/api/settings/reports', admin, { method: 'PUT', body: JSON.stringify({ reset: true }) })

  // Single-pupil card (portal & students page).
  console.log('\nReport card route')
  r = await api(`/api/reports/report-card?studentId=${pupils[0].id}`, admin)
  pdf = await pdfText(r.body)
  ck('admin single card 200 pdf', `${r.status}/${r.type.includes('pdf')}`, '200/true')
  ck('  one page', pdf.pages, 1)
  ck('  term auto-picked from exams (Term 2)', pdf.text.includes('TERM 2'), true)
  ck('  filename carries term', r.disposition, `attachment; filename="report-card-${TAG}-1-Term-2.pdf"`)
  r = await api('/api/reports/report-card', pupil)
  pdf = await pdfText(r.body)
  ck('pupil prints own card', r.status, 200)
  ck('  it is Amina\'s', pdf.text.includes('Amina'), true)
  r = await api(`/api/reports/report-card?studentId=${pupils[1].id}`, pupil)
  ck('pupil cannot print a classmate 403', r.status, 403)
  r = await api(`/api/reports/report-card?studentId=${pupils[0].id}&termId=${year.terms[0].id}`, admin)
  pdf = await pdfText(r.body)
  ck('explicit empty term → card with "No assessments"', pdf.text.includes('No assessments recorded'), true)

  // ─── Isolation & access ────────────────────────────────────────────────────
  console.log('\nIsolation')
  r = await api(`/api/reports/academic?classId=${otherClass.id}&termId=${term.id}`, admin)
  ck('another school\'s class → 404', r.status, 404)
  r = await api(`/api/reports/academic?${q}`, pupil)
  ck('pupil cannot read class results 403', r.status, 403)
  r = await api(`/api/reports/academic?${q}`, null)
  ck('anonymous 401', r.status, 401)
  r = await api(`/api/reports/academic?classId=${cls.id}`, admin)
  ck('missing termId 400', r.status, 400)
  const audit = await prisma.auditLog.count({ where: { schoolId: school.id, entity: { in: ['AcademicReport', 'ReportSettings', 'ReportRemark'] } } })
  ck('audit trail written for reports/settings/remarks', audit > 10, true)
} finally {
  await cleanup()
  await prisma.$disconnect()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
