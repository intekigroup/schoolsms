// User testing: walk each role through the app the way that person actually would.
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

const issues = []
function issue(role, what, detail) {
  issues.push({ role, what, detail })
  console.log(`  ✗ ${role.padEnd(13)} ${what}${detail ? ` — ${detail}` : ''}`)
}
function ok(role, what) { console.log(`  ✓ ${role.padEnd(13)} ${what}`) }

// What the sidebar offers each role (from dashboard-shell.tsx).
const NAV = {
  SCHOOL_ADMIN: ['/dashboard', '/dashboard/students', '/dashboard/teachers', '/dashboard/classes', '/dashboard/academics', '/dashboard/timetable', '/dashboard/attendance', '/dashboard/exams', '/dashboard/fees', '/dashboard/library', '/dashboard/hostel', '/dashboard/transport', '/dashboard/events', '/dashboard/communications', '/dashboard/reports', '/dashboard/settings'],
  TEACHER: ['/dashboard', '/dashboard/students', '/dashboard/classes', '/dashboard/academics', '/dashboard/timetable', '/dashboard/attendance', '/dashboard/exams', '/dashboard/events'],
  ACCOUNTANT: ['/dashboard', '/dashboard/fees', '/dashboard/reports'],
  LIBRARIAN: ['/dashboard', '/dashboard/library'],
  STUDENT: ['/dashboard/timetable'],
  PARENT: ['/dashboard/parents'],
}

const school = await prisma.school.findFirst()
async function probeUser(role, email) {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.user.create({ data: { email, name: `${role} tester`, role, schoolId: school.id, emailVerified: new Date(), hashedPassword: await bcrypt.hash('journey123', 12) } })
  return login(email, 'journey123')
}

console.log('\n=== JOURNEY 1: every sidebar link a role is shown must open ===')
for (const [role, paths] of Object.entries(NAV)) {
  const email = `journey-${role.toLowerCase()}@kilimanjaro.tz`
  const cookie = role === 'PARENT'
    ? await login('parent@kilimanjaro.tz', 'parent123')
    : role === 'SCHOOL_ADMIN'
      ? await login('admin@kilimanjaro.tz', 'admin123')
      : await probeUser(role, email)
  if (!cookie) { issue(role, 'cannot sign in'); continue }

  let broken = 0
  for (const path of paths) {
    const res = await fetch(B + path, { headers: { Cookie: cookie }, redirect: 'manual' })
    if (res.status !== 200) {
      const to = res.headers.get('location') ?? ''
      issue(role, `sidebar offers ${path} but it does not open`, `${res.status}${to ? ` → ${to.replace(B, '')}` : ''}`)
      broken++
    }
  }
  if (!broken) ok(role, `all ${paths.length} sidebar destinations open`)
  if (!['PARENT', 'SCHOOL_ADMIN'].includes(role)) await prisma.user.deleteMany({ where: { email } })
}

console.log('\n=== JOURNEY 2: a teacher takes the register, then enters marks ===')
{
  const cookie = await probeUser('TEACHER', 'journey-t2@kilimanjaro.tz')
  const cls = await prisma.class.findFirst({ where: { schoolId: school.id } })
  const students = await prisma.student.findMany({ where: { classId: cls.id }, take: 3, select: { id: true } })

  const save = await fetch(`${B}/api/attendance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ entries: students.map((s) => ({ studentId: s.id, date: '2026-04-01', status: 'PRESENT' })) }),
  })
  save.status === 200 ? ok('TEACHER', 'can save attendance') : issue('TEACHER', 'cannot save attendance', `${save.status}`)

  const reload = await fetch(`${B}/api/attendance?classId=${cls.id}&date=2026-04-01`, { headers: { Cookie: cookie } })
  const marks = (await reload.json()).attendance ?? {}
  Object.keys(marks).length === students.length
    ? ok('TEACHER', 'register reloads what was saved')
    : issue('TEACHER', 'register does not reload saved marks', `${Object.keys(marks).length}/${students.length}`)

  // A teacher needs an exam to enter marks against — can they create one?
  const subject = await prisma.subject.findFirst({ where: { schoolId: school.id } })
  const year = await prisma.academicYear.findFirst({ where: { schoolId: school.id } })
  const exam = await fetch(`${B}/api/exams`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Journey CAT', type: 'CAT', classId: cls.id, subjectId: subject.id, academicYearId: year.id, totalMarks: 100 }),
  })
  const examJson = await exam.json()
  exam.status === 200 ? ok('TEACHER', 'can create an exam') : issue('TEACHER', 'cannot create an exam', `${exam.status}`)
  if (exam.status === 200) {
    const marksRes = await fetch(`${B}/api/exams/results`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ examId: examJson.id, results: [{ studentId: students[0].id, marks: 71 }] }),
    })
    marksRes.status === 200 ? ok('TEACHER', 'can enter marks') : issue('TEACHER', 'cannot enter marks', `${marksRes.status}`)
    await prisma.examResult.deleteMany({ where: { examId: examJson.id } })
    await prisma.exam.delete({ where: { id: examJson.id } })
  }
  await prisma.attendance.deleteMany({ where: { date: new Date('2026-04-01') } })
  await prisma.user.deleteMany({ where: { email: 'journey-t2@kilimanjaro.tz' } })
}

console.log('\n=== JOURNEY 3: an accountant collects a fee and exports the ledger ===')
{
  const cookie = await probeUser('ACCOUNTANT', 'journey-acc@kilimanjaro.tz')
  const fee = await prisma.feeStructure.findFirst({ where: { schoolId: school.id } })
  const student = await prisma.student.findFirst({ where: { schoolId: school.id }, select: { id: true } })
  const pay = await fetch(`${B}/api/fees/payment`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ studentId: student.id, feeStructureId: fee.id, amount: 25000, paymentMethod: 'MPESA' }),
  })
  const payJson = await pay.json()
  pay.status === 200 ? ok('ACCOUNTANT', `can record a payment (${payJson.receiptNo})`) : issue('ACCOUNTANT', 'cannot record a payment', `${pay.status}`)

  const csv = await fetch(`${B}/api/reports/export?type=fees`, { headers: { Cookie: cookie } })
  const body = await csv.text()
  csv.status === 200 && body.includes(',') ? ok('ACCOUNTANT', 'can export the fee ledger') : issue('ACCOUNTANT', 'cannot export fees', `${csv.status}`)
  if (payJson.id) await prisma.feePayment.delete({ where: { id: payJson.id } })
  await prisma.user.deleteMany({ where: { email: 'journey-acc@kilimanjaro.tz' } })
}

console.log('\n=== JOURNEY 4: a student signs in to check their own information ===')
{
  const cookie = await probeUser('STUDENT', 'journey-student@kilimanjaro.tz')
  // A real student login is linked to a student record by the school office.
  const linkUser = await prisma.user.findUnique({ where: { email: 'journey-student@kilimanjaro.tz' } })
  const realStudent = await prisma.student.findFirst({ where: { schoolId: school.id, examResults: { some: {} } } })
  await prisma.student.update({ where: { id: realStudent.id }, data: { userId: linkUser.id } })

  const landing = await fetch(`${B}/dashboard`, { headers: { Cookie: cookie }, redirect: 'manual' })
  const dest = (landing.headers.get('location') ?? '').replace(B, '') || '/dashboard'
  console.log(`    a student landing on /dashboard is sent to: ${dest}`)

  const portal = await fetch(`${B}/dashboard/my`, { headers: { Cookie: cookie } })
  const html = portal.status === 200 ? await portal.text() : ''
  portal.status === 200 ? ok('STUDENT', 'own records page opens') : issue('STUDENT', 'own records page missing', `${portal.status}`)
  for (const [what, marker] of [['own grades', /Results/], ['own attendance', /Attendance/], ['own fee balance', /Fee balance/], ['own library loans', /Library/]]) {
    marker.test(html) ? ok('STUDENT', `sees ${what}`) : issue('STUDENT', `cannot see ${what}`)
  }
  // Staff areas must still be closed to them.
  for (const path of ['/dashboard/fees', '/dashboard/students']) {
    const r = await fetch(B + path, { headers: { Cookie: cookie }, redirect: 'manual' })
    if (r.status === 200) issue('STUDENT', `can open staff page ${path}`)
  }
  await prisma.student.update({ where: { id: realStudent.id }, data: { userId: null } })
  await prisma.user.deleteMany({ where: { email: 'journey-student@kilimanjaro.tz' } })
}

console.log('\n=== JOURNEY 5: a parent checks on their child ===')
{
  const cookie = await login('parent@kilimanjaro.tz', 'parent123')
  const res = await fetch(`${B}/dashboard/parents`, { headers: { Cookie: cookie } })
  const html = await res.text()
  ;/Baraka|Chiku/.test(html) ? ok('PARENT', 'sees their children by name') : issue('PARENT', 'children not shown')
  ;/%/.test(html) ? ok('PARENT', 'sees attendance percentage') : issue('PARENT', 'no attendance figure')
  ;/TZS|balance/i.test(html) ? ok('PARENT', 'sees a fee balance') : issue('PARENT', 'no fee balance')
  // Can a parent do anything at all, or only read?
  const write = await fetch(`${B}/api/students`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ firstName: 'x', lastName: 'y', admissionNo: 'z' }),
  })
  write.status === 403 ? ok('PARENT', 'correctly read-only') : issue('PARENT', 'can write', `${write.status}`)
}

console.log('\n=== JOURNEY 6: date and number formatting a Swahili user sees ===')
{
  const cookie = await login('admin@kilimanjaro.tz', 'admin123')
  const html = await (await fetch(`${B}/dashboard/fees`, { headers: { Cookie: cookie } })).text()
  const usDates = html.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) ?? []
  if (usDates.length) issue('ALL', 'dates rendered in US order', `e.g. ${usDates.slice(0, 3).join(', ')} (Tanzania uses d/m/y)`)
  else ok('ALL', 'no US-ordered dates found on the fees page')
}

console.log(`\n${issues.length} user-facing gap(s) found`)
await prisma.$disconnect()
