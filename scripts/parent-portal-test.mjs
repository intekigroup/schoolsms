// Parent portal across schools, parent PDF downloads, pupil/guardian timetables, guardian reuse by phone.
//   node scripts/parent-portal-test.mjs [baseUrl]

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
  return { status: r.status, type, body: type.includes('json') ? await r.json().catch(() => ({})) : await r.arrayBuffer() }
}
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }); return { status: r.status, html: (await r.text()).replace(/<!--.*?-->/g, '') } }

const TAG = 'PPT'
const K = 'school-kilimanjaro'
async function cleanup() {
  const other = await prisma.school.findFirst({ where: { name: `Far School ${TAG}` }, select: { id: true } })
  const users = (await prisma.user.findMany({ where: { email: { endsWith: `.${TAG.toLowerCase()}@x.tz` } }, select: { id: true } })).map((u) => u.id)
  if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } }); await prisma.notification.deleteMany({ where: { userId: { in: users } } }); await prisma.message.deleteMany({ where: { OR: [{ senderId: { in: users } }, { recipientId: { in: users } }] } }) }
  const students = (await prisma.student.findMany({ where: { OR: [{ admissionNo: { startsWith: `${TAG}-` } }, ...(other ? [{ schoolId: other.id }] : [])] }, select: { id: true } })).map((s) => s.id)
  await prisma.feePayment.deleteMany({ where: { receiptNo: { startsWith: `RCP-${TAG}-` } } })
  if (students.length) { await prisma.examResult.deleteMany({ where: { studentId: { in: students } } }); await prisma.studentGuardian.deleteMany({ where: { studentId: { in: students } } }); await prisma.message.deleteMany({ where: { studentId: { in: students } } }); await prisma.student.deleteMany({ where: { id: { in: students } } }) }
  await prisma.guardian.deleteMany({ where: { lastName: `Guardian${TAG}` } })
  await prisma.feePayment.deleteMany({ where: { receiptNo: { startsWith: `RCP-${TAG}-` } } }); await prisma.feeStructure.deleteMany({ where: { name: `Tuition ${TAG}`, schoolId: K } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.staff.deleteMany({ where: { employeeNo: { startsWith: `${TAG}-` } } })
  await prisma.timetableSlot.deleteMany({ where: { class: { name: { endsWith: ` ${TAG}` } } } })
  await prisma.exam.deleteMany({ where: { name: `Exam ${TAG}` } })
  await prisma.class.deleteMany({ where: { name: { endsWith: ` ${TAG}` } } })
  if (other) {
    await prisma.staff.deleteMany({ where: { schoolId: other.id } }); await prisma.subject.deleteMany({ where: { schoolId: other.id } })
    await prisma.term.deleteMany({ where: { academicYear: { schoolId: other.id } } }); await prisma.academicYear.deleteMany({ where: { schoolId: other.id } })
    await prisma.feeStructure.deleteMany({ where: { schoolId: other.id } }); await prisma.announcement.deleteMany({ where: { schoolId: other.id } })
    await prisma.schoolSubscription.deleteMany({ where: { schoolId: other.id } }); await prisma.school.delete({ where: { id: other.id } })
  }
}
await cleanup()

// Fixtures: mama has a daughter in Kilimanjaro and a son in a second school.
const pw = await bcrypt.hash('pass1234', 10)
const kClass = await prisma.class.create({ data: { name: `Std 3 ${TAG}`, level: 'PRIMARY', schoolId: K } })
const kOther = await prisma.class.create({ data: { name: `Std 4 ${TAG}`, level: 'PRIMARY', schoolId: K } })
const subj = await prisma.subject.findFirst({ where: { schoolId: K } })
const daughter = await prisma.student.create({ data: { admissionNo: `${TAG}-1`, firstName: 'Neema', lastName: 'Kid', gender: 'FEMALE', dateOfBirth: new Date('2016-01-01'), schoolId: K, classId: kClass.id } })
const stranger = await prisma.student.create({ data: { admissionNo: `${TAG}-2`, firstName: 'Other', lastName: 'Kid', gender: 'MALE', dateOfBirth: new Date('2016-01-01'), schoolId: K, classId: kOther.id } })
const far = await prisma.school.create({ data: { name: `Far School ${TAG}`, schoolLevel: ['PRIMARY'], subscription: { create: { plan: 'FREE', maxStudents: 50, maxStaff: 10 } }, academicYears: { create: { name: '2026', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), isCurrent: true, terms: { create: { name: 'Term 1', startDate: new Date('2026-01-01'), endDate: new Date('2026-04-01'), isCurrent: true } } } } } })
const fClass = await prisma.class.create({ data: { name: `Std 1 ${TAG}`, level: 'PRIMARY', schoolId: far.id } })
const fSubject = await prisma.subject.create({ data: { name: `Maths ${TAG}`, schoolId: far.id } })
const son = await prisma.student.create({ data: { admissionNo: `F-${TAG}-1`, firstName: 'Baraka', lastName: 'Kid', gender: 'MALE', dateOfBirth: new Date('2018-01-01'), schoolId: far.id, classId: fClass.id } })
const farAdmin = await prisma.user.create({ data: { email: `admin.${TAG.toLowerCase()}@x.tz`, name: 'Far Admin', role: 'SCHOOL_ADMIN', hashedPassword: pw, schoolId: far.id, emailVerified: new Date() } })
const farTeacherUser = await prisma.user.create({ data: { email: `teacher.${TAG.toLowerCase()}@x.tz`, name: 'Far Teacher', role: 'TEACHER', hashedPassword: pw, schoolId: far.id, emailVerified: new Date() } })
const farTeacher = await prisma.staff.create({ data: { employeeNo: `${TAG}-FT`, firstName: 'Far', lastName: 'Teacher', gender: 'MALE', schoolId: far.id, userId: farTeacherUser.id } })
await prisma.class.update({ where: { id: fClass.id }, data: { classTeacherId: farTeacher.id } })
await prisma.feeStructure.create({ data: { name: `Tuition ${TAG}`, amount: 70000, schoolId: far.id } })
await prisma.announcement.create({ data: { title: `Far notice ${TAG}`, content: 'Sports day', schoolId: far.id, isPublic: true } })
await prisma.timetableSlot.create({ data: { classId: kClass.id, dayOfWeek: 1, startTime: '07:30', endTime: '08:15', subjectId: subj.id } })
await prisma.timetableSlot.create({ data: { classId: kOther.id, dayOfWeek: 1, startTime: '07:30', endTime: '08:15', subjectId: subj.id } })
await prisma.timetableSlot.create({ data: { classId: fClass.id, dayOfWeek: 2, startTime: '09:00', endTime: '09:45', subjectId: fSubject.id, staffId: farTeacher.id } })
const term = await prisma.term.findFirst({ where: { academicYear: { schoolId: K } }, include: { academicYear: true } })
const exam = await prisma.exam.create({ data: { name: `Exam ${TAG}`, classId: kClass.id, subjectId: subj.id, termId: term.id, academicYearId: term.academicYearId, date: new Date(), totalMarks: 100, type: 'CAT', status: 'PUBLISHED' } })
await prisma.examResult.create({ data: { studentId: daughter.id, examId: exam.id, subjectId: subj.id, marks: 81, grade: 'A' } })
const kFee = await prisma.feeStructure.create({ data: { name: `Tuition ${TAG}`, amount: 300000, schoolId: K, dueDate: new Date('2026-10-01') } })
const kPay = await prisma.feePayment.create({ data: { studentId: daughter.id, schoolId: K, feeStructureId: kFee.id, amount: 120000, paymentMethod: 'MPESA', receiptNo: `RCP-${TAG}-1`, transactionRef: 'MP123' } })
const strangerPay = await prisma.feePayment.create({ data: { studentId: stranger.id, schoolId: K, feeStructureId: kFee.id, amount: 5000, receiptNo: `RCP-${TAG}-2` } })
const mamaUser = await prisma.user.create({ data: { email: `mama.${TAG.toLowerCase()}@x.tz`, name: 'Mama Kid', role: 'PARENT', hashedPassword: pw, schoolId: K, emailVerified: new Date() } })
const mama = await prisma.guardian.create({ data: { firstName: 'Mama', lastName: `Guardian${TAG}`, phone: '+255700000777', userId: mamaUser.id, students: { create: [{ studentId: daughter.id, isPrimary: true }, { studentId: son.id, isPrimary: true }] } } })
const pupilUser = await prisma.user.create({ data: { email: `pupil.${TAG.toLowerCase()}@x.tz`, name: 'Neema Kid', role: 'STUDENT', hashedPassword: pw, schoolId: K, emailVerified: new Date(), student: { connect: { id: daughter.id } } } })

const parent = await login(`mama.${TAG.toLowerCase()}@x.tz`, 'pass1234')
const pupil = await login(`pupil.${TAG.toLowerCase()}@x.tz`, 'pass1234')
const admin = await login('admin@kilimanjaro.tz', 'admin123')
const fadmin = await login(`admin.${TAG.toLowerCase()}@x.tz`, 'pass1234')
ck('logins', !!(parent && pupil && admin && fadmin), true)

console.log('\n# Parent portal shows children from both schools')
let p = await page('/dashboard/parents', parent); ck('portal renders', p.status, 200)
ck('  daughter (home school)', p.html.includes('Neema Kid'), true); ck('  son (other school)', p.html.includes('Baraka Kid'), true)
ck('  school names shown when children span schools', p.html.includes(`Far School ${TAG}`), true)
ck('  other school\'s notice appears', p.html.includes(`Far notice ${TAG}`), true)
ck('  son\'s fees come from his own school (70,000)', /70,000/.test(p.html), true)
ck('  documents block present', p.html.includes('Fee statement'), true)
ck('  report card offered for the published term', p.html.includes('/api/reports/report-card?studentId=' + daughter.id), true)

console.log('\n# Parent downloads')
let r = await api(`/api/reports/report-card?studentId=${daughter.id}&termId=${term.id}`, parent); ck('report card for own child -> 200 PDF', `${r.status} ${r.type.includes('pdf')}`, '200 true')
r = await api(`/api/reports/fee-statement?studentId=${son.id}`, parent); ck('fee statement for child in the other school -> 200 PDF', `${r.status} ${r.type.includes('pdf')}`, '200 true')
r = await api(`/api/reports/report-card?studentId=${stranger.id}`, parent); ck('report card for someone else\'s child -> 403', r.status, 403)
r = await api(`/api/reports/fee-statement?studentId=${stranger.id}`, parent); ck('fee statement for someone else\'s child -> 403', r.status, 403)
r = await api(`/api/timetable/pdf?classId=${fClass.id}`, parent); ck('timetable PDF for son\'s class (other school) -> 200', r.status, 200)
r = await api(`/api/timetable/pdf?classId=${kOther.id}`, parent); ck('timetable PDF for an unrelated class -> 403', r.status, 403)

console.log('\n# Payment history, receipts and invoices')
p = await page('/dashboard/parents', parent); ck('payment history shown on the child card', p.html.includes(`RCP-${TAG}-1`) && /120,000/.test(p.html), true)
ck('  receipt link present', p.html.includes(`/api/fees/receipt?paymentId=${kPay.id}`), true); ck('  invoice button present', p.html.includes(`/api/fees/invoice?studentId=${daughter.id}`), true)
r = await api(`/api/fees/receipt?paymentId=${kPay.id}`, parent); ck('parent downloads own child\'s receipt', `${r.status} ${r.type.includes('pdf')}`, '200 true')
r = await api(`/api/fees/receipt?paymentId=${strangerPay.id}`, parent); ck('someone else\'s receipt -> 403', r.status, 403)
r = await api(`/api/fees/receipt?paymentId=${kPay.id}`, pupil); ck('pupil downloads own receipt', r.status, 200)
r = await api(`/api/fees/receipt?paymentId=${strangerPay.id}`, pupil); ck('pupil cannot open another pupil\'s receipt', r.status, 403)
r = await api(`/api/fees/receipt?paymentId=${kPay.id}`, admin); ck('office prints any receipt', r.status, 200)
r = await api(`/api/fees/receipt?paymentId=${kPay.id}`, fadmin); ck('another school\'s office -> 404', r.status, 404)
r = await api(`/api/fees/receipt?paymentId=nope`, parent); ck('unknown receipt -> 404', r.status, 404)
r = await api(`/api/fees/invoice?studentId=${daughter.id}`, parent); ck('parent downloads invoice', `${r.status} ${r.type.includes('pdf')}`, '200 true')
{ const { inflateSync } = require('node:zlib'); const latin = Buffer.from(r.body).toString('latin1'); let drawn = ''
  for (const m of latin.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) { try { const x = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); for (const h of x.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) drawn += Buffer.from(h[1], 'hex').toString('latin1') + '\n' } catch {} }
  ck('  invoice lists the fee, paid and balance', /Tuition PPT/.test(drawn) && /300,000/.test(drawn) && /120,000/.test(drawn) && /180,000/.test(drawn), true)
  ck('  invoice number is deterministic', /INV-PPT-1-\d{6}/.test(drawn), true); ck('  due date printed', /01 Oct 2026/.test(drawn), true) }
r = await api(`/api/fees/invoice?studentId=${stranger.id}`, parent); ck('invoice for someone else\'s child -> 403', r.status, 403)
r = await api(`/api/fees/invoice?studentId=${son.id}`, parent); ck('invoice for the child in the other school -> 200', r.status, 200)

console.log('\n# Timetables are scoped to the viewer')
p = await page('/dashboard/timetable', pupil); ck('pupil timetable page', p.status, 200)
ck('  shows own class', p.html.includes(`Std 3 ${TAG}`), true); ck('  not the other class', p.html.includes(`Std 4 ${TAG}`), false); ck('  no teacher tab', p.html.includes('By teacher'), false)
r = await api(`/api/timetable?classId=${kClass.id}`, pupil); ck('pupil GET own class slots', `${r.status} ${r.body.slots?.length}`, '200 1')
r = await api(`/api/timetable?classId=${kOther.id}`, pupil); ck('pupil GET other class -> 403', r.status, 403)
r = await api(`/api/timetable?staffId=x`, pupil); ck('pupil GET by teacher -> 403', r.status, 403)
p = await page('/dashboard/timetable', parent); ck('parent timetable page', p.status, 200)
ck('  both children\'s classes listed', p.html.includes(`Std 3 ${TAG}`) && p.html.includes(`Std 1 ${TAG}`), true)
p = await page('/dashboard/parents', parent); ck('parent sidebar has Timetable', p.html.includes('href="/dashboard/timetable"'), true)

console.log('\n# Messaging reaches teachers in every child\'s school')
r = await api('/api/messages', parent); ck('contacts', r.status, 200)
const contacts = r.body.contacts ?? []
ck('  far school class teacher is a contact', contacts.some((c) => c.userId === farTeacherUser.id && c.studentId === son.id), true)
ck('  far school office is a contact', contacts.some((c) => c.userId === farAdmin.id && c.studentId === son.id), true)
r = await api('/api/messages', parent, { method: 'POST', body: JSON.stringify({ studentId: son.id, recipientId: farTeacherUser.id, body: 'Habari mwalimu' }) }); ck('parent messages the far teacher', r.status, 200)
const sent = await prisma.message.findFirst({ where: { studentId: son.id }, select: { schoolId: true } }); ck('  message filed under the son\'s school', sent?.schoolId, far.id)
r = await api(`/api/messages?with=${mamaUser.id}&studentId=${son.id}`, await login(`teacher.${TAG.toLowerCase()}@x.tz`, 'pass1234')); ck('far teacher sees the thread', `${r.status} ${(r.body.messages ?? r.body.thread ?? []).length}`, '200 1')

console.log('\n# Guardian reuse: the second school links the same parent instead of duplicating')
r = await api('/api/guardians', fadmin, { method: 'POST', body: JSON.stringify({ firstName: 'Mama', lastName: 'Duplicate', phone: '0700 000 777', studentId: son.id }) })
ck('POST guardian with the same phone -> 200', r.status, 200); ck('  reused existing record', r.body.reused, true); ck('  reports she already has a login', r.body.hasLogin, true)
ck('  no duplicate guardian created', await prisma.guardian.count({ where: { phone: { in: ['+255700000777', '0700 000 777'] } } }), 1)
r = await api('/api/guardians/account', fadmin, { method: 'POST', body: JSON.stringify({ guardianId: mama.id }) }); ck('second login refused with an explanation', `${r.status} ${/already has a Shule SMS login/.test(r.body.error ?? '')}`, '409 true')

await cleanup()
console.log(`\n${pass} passed, ${fail} failed`)
await prisma.$disconnect()
process.exit(fail ? 1 : 0)
