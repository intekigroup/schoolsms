// Homework & lesson notes (scoped posting, guardian/pupil visibility, notifications) and teacher ↔ guardian messaging.
//   node scripts/homework-messages-test.mjs [baseUrl]

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
  return { status: r.status, body: type.includes('json') ? await r.json().catch(() => ({})) : await r.text() }
}
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: { Cookie: cookie } }); return { status: r.status, html: await r.text() } }
const unread = async (cookie) => (await api('/api/notifications', cookie)).body?.unread ?? 0

const school = await prisma.school.findUnique({ where: { id: 'school-kilimanjaro' } })
const TAG = 'HMT'
async function cleanup() {
  const staff = await prisma.staff.findMany({ where: { schoolId: school.id, employeeNo: { startsWith: `${TAG}-` } }, select: { id: true } })
  const users = (await prisma.user.findMany({ where: { OR: [{ email: { startsWith: `${TAG.toLowerCase()}-` } }, { email: { endsWith: `.${TAG.toLowerCase()}@x.tz` } }] }, select: { id: true } })).map((u) => u.id)
  const classes = (await prisma.class.findMany({ where: { schoolId: school.id, name: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((c) => c.id)
  const students = (await prisma.student.findMany({ where: { schoolId: school.id, admissionNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)
  const guardians = (await prisma.guardian.findMany({ where: { lastName: `Test${TAG}` }, select: { id: true } })).map((g) => g.id)
  const subjects = (await prisma.subject.findMany({ where: { schoolId: school.id, name: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((s) => s.id)
  if (classes.length) { await prisma.class.updateMany({ where: { id: { in: classes } }, data: { classTeacherId: null } }); await prisma.assignment.deleteMany({ where: { classId: { in: classes } } }) }
  if (students.length) { await prisma.message.deleteMany({ where: { studentId: { in: students } } }); await prisma.studentGuardian.deleteMany({ where: { studentId: { in: students } } }); await prisma.student.deleteMany({ where: { id: { in: students } } }) }
  if (guardians.length) await prisma.guardian.deleteMany({ where: { id: { in: guardians } } })
  if (classes.length) await prisma.class.deleteMany({ where: { id: { in: classes } } })
  if (subjects.length) await prisma.subject.deleteMany({ where: { id: { in: subjects } } })
  if (staff.length) await prisma.staff.deleteMany({ where: { id: { in: staff.map((s) => s.id) } } })
  if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } }); await prisma.notification.deleteMany({ where: { userId: { in: users } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }) }
}
await cleanup()

const clsA = await prisma.class.create({ data: { name: `Std 3 ${TAG}`, level: 'PRIMARY', schoolId: school.id } })
const clsB = await prisma.class.create({ data: { name: `Std 4 ${TAG}`, level: 'PRIMARY', schoolId: school.id } })
const maths = await prisma.subject.create({ data: { name: `Maths ${TAG}`, schoolId: school.id } })
const kisw = await prisma.subject.create({ data: { name: `Kiswahili ${TAG}`, schoolId: school.id } })
const p1 = await prisma.student.create({ data: { admissionNo: `${TAG}-1`, firstName: 'Zuri', lastName: `Test${TAG}`, gender: 'FEMALE', dateOfBirth: new Date('2016-01-01'), schoolId: school.id, classId: clsA.id } })
const p2 = await prisma.student.create({ data: { admissionNo: `${TAG}-2`, firstName: 'Kito', lastName: `Test${TAG}`, gender: 'MALE', dateOfBirth: new Date('2015-01-01'), schoolId: school.id, classId: clsB.id } })
const pupilUser = await prisma.user.create({ data: { email: `${TAG.toLowerCase()}-zuri@staff.local`, name: 'Zuri', role: 'STUDENT', hashedPassword: await bcrypt.hash('p123', 10), schoolId: school.id, emailVerified: new Date(), student: { connect: { id: p1.id } } } })
const mamaUser = await prisma.user.create({ data: { email: `mama.${TAG.toLowerCase()}@x.tz`, name: 'Mama Zuri', role: 'PARENT', hashedPassword: await bcrypt.hash('g123', 10), schoolId: school.id, emailVerified: new Date() } })
const mama = await prisma.guardian.create({ data: { firstName: 'Mama', lastName: `Test${TAG}`, phone: '+255700000777', relationship: 'Mother', userId: mamaUser.id } })
await prisma.studentGuardian.create({ data: { studentId: p1.id, guardianId: mama.id, isPrimary: true } })
const babaUser = await prisma.user.create({ data: { email: `baba.${TAG.toLowerCase()}@x.tz`, name: 'Baba Kito', role: 'PARENT', hashedPassword: await bcrypt.hash('g123', 10), schoolId: school.id, emailVerified: new Date() } })
const baba = await prisma.guardian.create({ data: { firstName: 'Baba', lastName: `Test${TAG}`, phone: '+255700000778', userId: babaUser.id } })
await prisma.studentGuardian.create({ data: { studentId: p2.id, guardianId: baba.id, isPrimary: true } })
const t1 = await prisma.staff.create({ data: { employeeNo: `${TAG}-T1`, firstName: 'Mwalimu', lastName: `Test${TAG}`, gender: 'FEMALE', role: 'Teacher', schoolId: school.id } })
const t1User = await prisma.user.create({ data: { email: `${TAG.toLowerCase()}-t1@staff.local`, name: 'Mwalimu Amina', role: 'TEACHER', hashedPassword: await bcrypt.hash('t123', 10), schoolId: school.id, emailVerified: new Date() } })
await prisma.staff.update({ where: { id: t1.id }, data: { userId: t1User.id } })
await prisma.class.update({ where: { id: clsA.id }, data: { classTeacherId: t1.id } }) // class teacher of Std 3
await prisma.staffSubject.create({ data: { staffId: t1.id, subjectId: maths.id, classId: clsB.id } }) // teaches Maths in Std 4

const admin = await login('admin@kilimanjaro.tz', 'admin123')
const teach = await login(t1User.email, 't123')
const mamaC = await login(mamaUser.email, 'g123')
const babaC = await login(babaUser.email, 'g123')
const pupil = await login(pupilUser.email, 'p123')
ck('logins', !!admin && !!teach && !!mamaC && !!babaC && !!pupil, true)

try {
  console.log('\nHomework — posting rules')
  const before = { mama: await unread(mamaC), pupil: await unread(pupil), baba: await unread(babaC) }
  let r = await api('/api/homework', teach, { method: 'POST', body: JSON.stringify({ classId: clsA.id, kind: 'HOMEWORK', title: 'Reading page 12', description: 'Read the story and answer questions 1–5.', dueDate: '2031-05-06' }) })
  ck('class teacher posts general homework for own class', r.status, 200)
  const hw1 = r.body.assignment
  ck('  notifies the guardian and the pupil', (await unread(mamaC)) > before.mama && (await unread(pupil)) > before.pupil, true)
  ck('  not the other class’s guardian', await unread(babaC), before.baba)
  r = await api('/api/homework', teach, { method: 'POST', body: JSON.stringify({ classId: clsB.id, subjectId: maths.id, kind: 'HOMEWORK', title: 'Fractions', description: 'Ex 3.1', dueDate: '2031-05-07' }) })
  ck('subject teacher posts Maths homework in Std 4', r.status, 200)
  const hw2 = r.body.assignment
  r = await api('/api/homework', teach, { method: 'POST', body: JSON.stringify({ classId: clsB.id, subjectId: kisw.id, kind: 'HOMEWORK', title: 'Insha', description: 'x' }) })
  ck('Kiswahili in Std 4 (not taught) 403', r.status, 403)
  r = await api('/api/homework', teach, { method: 'POST', body: JSON.stringify({ classId: clsB.id, kind: 'NOTE', title: 'General note', description: 'x' }) })
  ck('general note in a class only taught by subject → allowed (class on load)', r.status, 200)
  const note = r.body.assignment
  r = await api('/api/homework', teach, { method: 'POST', body: JSON.stringify({ classId: clsA.id, kind: 'NOTE', title: 'Staff only', description: 'Reminder for me', visibleToGuardians: false }) })
  const hidden = r.body.assignment
  ck('staff-only note posted', r.status, 200)
  r = await api('/api/homework', mamaC, { method: 'POST', body: JSON.stringify({ classId: clsA.id, kind: 'HOMEWORK', title: 'x', description: 'x' }) })
  ck('guardian cannot post 403', r.status, 403)

  console.log('\nHomework — who sees what')
  r = await api('/api/homework', mamaC)
  ck('Mama sees Std 3 items that are guardian-visible (1)', `${r.body.assignments.length}/${r.body.assignments[0]?.title}`, '1/Reading page 12')
  r = await api('/api/homework', pupil)
  ck('Zuri sees the same (1)', r.body.assignments.length, 1)
  r = await api('/api/homework', babaC)
  ck('Baba sees Std 4 items (2: Maths + note)', r.body.assignments.length, 2)
  r = await api('/api/homework', teach)
  ck('teacher sees all four of hers, including staff-only', r.body.assignments.length, 4)
  r = await api(`/api/homework?classId=${clsB.id}`, mamaC)
  ck('guardian asking for another class 403', r.status, 403)
  r = await page('/dashboard/parents', mamaC)
  ck('parent portal shows the homework card and a message link', r.html.includes('Reading page 12') && r.html.includes('Message a teacher') && !r.html.includes('Staff only'), true)
  r = await page('/dashboard/my', pupil)
  ck('pupil portal Homework tab lists it', r.html.includes('Reading page 12'), true)
  r = await api('/api/homework', admin, { method: 'PATCH', body: JSON.stringify({ id: hw1.id, title: 'Reading page 12–13' }) })
  ck('office edits any item', `${r.status}/${r.body.assignment.title}`, '200/Reading page 12–13')
  const t2 = await prisma.staff.create({ data: { employeeNo: `${TAG}-T2`, firstName: 'Other', lastName: `Test${TAG}`, gender: 'MALE', role: 'Teacher', schoolId: school.id } })
  const t2User = await prisma.user.create({ data: { email: `${TAG.toLowerCase()}-t2@staff.local`, name: 'Other', role: 'TEACHER', hashedPassword: await bcrypt.hash('t123', 10), schoolId: school.id, emailVerified: new Date() } })
  await prisma.staff.update({ where: { id: t2.id }, data: { userId: t2User.id } })
  await prisma.staffSubject.create({ data: { staffId: t2.id, subjectId: kisw.id, classId: clsA.id } })
  const other = await login(t2User.email, 't123')
  r = await api('/api/homework', other, { method: 'PATCH', body: JSON.stringify({ id: hw1.id, title: 'Hijacked' }) })
  ck('another teacher of the class cannot edit her item 403', r.status, 403)
  r = await api(`/api/homework?id=${hidden.id}`, teach, { method: 'DELETE' })
  ck('author deletes', r.status, 200)
  void hw2; void note

  console.log('\nMessages — contacts')
  r = await api('/api/messages', teach)
  ck('teacher contacts: Mama (Std 3) and Baba (Std 4)', r.body.contacts.map((c) => c.name).sort().join(','), 'Baba TestHMT,Mama TestHMT')
  ck('  relation shown', r.body.contacts.find((c) => c.name.startsWith('Mama')).relation, 'Mother')
  r = await api('/api/messages', mamaC)
  ck('Mama contacts: class teacher, subject teacher, office', [...new Set(r.body.contacts.map((c) => c.relation))].sort().join(','), 'Class teacher,School office,Teacher')
  r = await api('/api/messages', babaC)
  ck('Baba contacts: Maths teacher + office (no class teacher set)', [...new Set(r.body.contacts.map((c) => c.relation))].sort().join(','), 'School office,Teacher')

  console.log('\nMessages — sending, reading, boundaries')
  const mamaBefore = await unread(mamaC)
  r = await api('/api/messages', teach, { method: 'POST', body: JSON.stringify({ studentId: p1.id, recipientId: mamaUser.id, body: 'Habari, Zuri did very well in reading today.' }) })
  ck('teacher → Mama about Zuri 200', r.status, 200)
  ck('  Mama notified', (await unread(mamaC)) > mamaBefore, true)
  r = await api('/api/messages', teach, { method: 'POST', body: JSON.stringify({ studentId: p2.id, recipientId: mamaUser.id, body: 'wrong pupil' }) })
  ck('teacher → Mama about Kito (not her child) 403', r.status, 403)
  r = await api('/api/messages', other, { method: 'POST', body: JSON.stringify({ studentId: p2.id, recipientId: babaUser.id, body: 'x' }) })
  ck('teacher not teaching Kito cannot message Baba 403', r.status, 403)
  r = await api('/api/messages', mamaC)
  ck('Mama inbox: 1 conversation, 1 unread', `${r.body.conversations.length}/${r.body.conversations[0].unread}/${r.body.unread}`, '1/1/1')
  r = await api(`/api/messages?with=${t1User.id}&studentId=${p1.id}`, mamaC)
  ck('opening the thread shows the message and marks it read', `${r.body.messages.length}/${r.body.messages[0].mine}`, '1/false')
  ck('  unread now 0', (await api('/api/messages', mamaC)).body.unread, 0)
  r = await api('/api/messages', mamaC, { method: 'POST', body: JSON.stringify({ studentId: p1.id, recipientId: t1User.id, body: 'Asante mwalimu! Can we meet on Friday?' }) })
  ck('Mama replies 200', r.status, 200)
  r = await api('/api/messages', mamaC, { method: 'POST', body: JSON.stringify({ studentId: p1.id, recipientId: babaUser.id, body: 'hi' }) })
  ck('guardian → another guardian 403', r.status, 403)
  r = await api('/api/messages', mamaC, { method: 'POST', body: JSON.stringify({ studentId: p1.id, recipientId: 'admin-x', body: 'hi' }) })
  ck('unknown recipient 403', r.status, 403)
  r = await api(`/api/messages?with=${mamaUser.id}&studentId=${p1.id}`, teach)
  ck('teacher thread has both messages, hers marked read', `${r.body.messages.length}/${!!r.body.messages[0].readAt}`, '2/true')
  r = await api('/api/messages', admin, { method: 'POST', body: JSON.stringify({ studentId: p2.id, recipientId: babaUser.id, body: 'Fees reminder for Kito.' }) })
  ck('office → any guardian 200', r.status, 200)
  r = await api('/api/messages', babaC, { method: 'POST', body: JSON.stringify({ studentId: p2.id, recipientId: (await prisma.user.findFirst({ where: { email: 'admin@kilimanjaro.tz' } })).id, body: 'Received, thanks.' }) })
  ck('guardian replies to the office 200', r.status, 200)
  r = await api(`/api/messages?with=${babaUser.id}&studentId=${p2.id}`, teach)
  ck('teacher cannot read the office↔Baba thread (empty)', r.body.messages.length, 0)
  r = await page('/dashboard/messages', mamaC)
  ck('messages page renders for a guardian', r.status === 200 && r.html.includes('Messages'), true)
  r = await page('/dashboard/messages', pupil)
  ck('pupils have no messages page (redirect/403)', r.status !== 200 || !r.html.includes('New message'), true)
  const audit = await prisma.auditLog.count({ where: { schoolId: school.id, entity: { in: ['Assignment', 'Message'] } } })
  ck('audit rows', audit >= 8, true)
} finally {
  await cleanup()
  await prisma.$disconnect()
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
