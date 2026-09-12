// Timetable builder (create/move/swap/clash/force, teacher week, PDF) and seating plans (save/validate/scope/PDF).
//   node scripts/timetable-seating-test.mjs [baseUrl]

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
  return { text: out, pages: doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]) }
}
const api = async (path, cookie, init = {}) => {
  const r = await fetch(B + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) }, redirect: 'manual' })
  const type = r.headers.get('content-type') ?? ''
  const body = type.includes('json') ? await r.json().catch(() => ({})) : type.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : await r.text()
  return { status: r.status, type, body, disposition: r.headers.get('content-disposition') }
}
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: { Cookie: cookie } }); return { status: r.status, html: await r.text() } }

// ─── Fixtures ────────────────────────────────────────────────────────────────
const school = await prisma.school.findUnique({ where: { id: 'school-kilimanjaro' } })
const TAG = 'TTS'
async function cleanup() {
  const staff = await prisma.staff.findMany({ where: { schoolId: school.id, employeeNo: { startsWith: `${TAG}-` } }, select: { id: true, userId: true } })
  const users = [...new Set([...staff.map((s) => s.userId).filter(Boolean), ...(await prisma.user.findMany({ where: { email: { startsWith: `${TAG.toLowerCase()}-` } }, select: { id: true } })).map((u) => u.id)])]
  const classes = (await prisma.class.findMany({ where: { schoolId: school.id, name: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((c) => c.id)
  const students = (await prisma.student.findMany({ where: { schoolId: school.id, admissionNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)
  const subjects = (await prisma.subject.findMany({ where: { schoolId: school.id, name: { endsWith: ` ${TAG}` } }, select: { id: true } })).map((s) => s.id)
  if (classes.length) {
    await prisma.class.updateMany({ where: { id: { in: classes } }, data: { classTeacherId: null, monitorId: null, monitressId: null } })
    await prisma.seatPlan.deleteMany({ where: { classId: { in: classes } } })
    await prisma.timetableSlot.deleteMany({ where: { classId: { in: classes } } })
    await prisma.classSubject.deleteMany({ where: { classId: { in: classes } } })
  }
  if (students.length) await prisma.student.deleteMany({ where: { id: { in: students } } })
  if (classes.length) await prisma.class.deleteMany({ where: { id: { in: classes } } })
  if (subjects.length) await prisma.subject.deleteMany({ where: { id: { in: subjects } } })
  if (staff.length) await prisma.staff.deleteMany({ where: { id: { in: staff.map((s) => s.id) } } })
  if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }) }
}
await cleanup()

const clsA = await prisma.class.create({ data: { name: `Form 1 ${TAG}`, level: 'O_LEVEL', schoolId: school.id } })
const clsB = await prisma.class.create({ data: { name: `Form 2 ${TAG}`, level: 'O_LEVEL', schoolId: school.id } })
const maths = await prisma.subject.create({ data: { name: `Maths ${TAG}`, schoolId: school.id } })
const phys = await prisma.subject.create({ data: { name: `Physics ${TAG}`, schoolId: school.id } })
await prisma.classSubject.createMany({ data: [{ classId: clsA.id, subjectId: maths.id }, { classId: clsA.id, subjectId: phys.id }] })
const t1 = await prisma.staff.create({ data: { employeeNo: `${TAG}-T1`, firstName: 'Juma', lastName: `Test${TAG}`, gender: 'MALE', role: 'Teacher', schoolId: school.id } })
const t2 = await prisma.staff.create({ data: { employeeNo: `${TAG}-T2`, firstName: 'Rehema', lastName: `Test${TAG}`, gender: 'FEMALE', role: 'Teacher', schoolId: school.id } })
await prisma.staffSubject.create({ data: { staffId: t1.id, subjectId: maths.id, classId: clsA.id } })
const pupils = []
for (let i = 1; i <= 8; i++) pupils.push(await prisma.student.create({ data: { admissionNo: `${TAG}-${i}`, firstName: `Pupil${i}`, lastName: `Test${TAG}`, gender: i % 2 ? 'MALE' : 'FEMALE', dateOfBirth: new Date('2012-01-01'), schoolId: school.id, classId: clsA.id } }))
const t1User = await prisma.user.create({ data: { email: `${TAG.toLowerCase()}-t1@staff.local`, name: 'Juma', role: 'TEACHER', hashedPassword: await bcrypt.hash('t123', 10), schoolId: school.id, emailVerified: new Date() } })
await prisma.staff.update({ where: { id: t1.id }, data: { userId: t1User.id } })
const t2User = await prisma.user.create({ data: { email: `${TAG.toLowerCase()}-t2@staff.local`, name: 'Rehema', role: 'TEACHER', hashedPassword: await bcrypt.hash('t123', 10), schoolId: school.id, emailVerified: new Date() } })
await prisma.staff.update({ where: { id: t2.id }, data: { userId: t2User.id } })
await prisma.class.update({ where: { id: clsA.id }, data: { classTeacherId: t2.id } }) // Rehema is class teacher of Form 1

const admin = await login('admin@kilimanjaro.tz', 'admin123')
const juma = await login(`${TAG.toLowerCase()}-t1@staff.local`, 't123')
const rehema = await login(`${TAG.toLowerCase()}-t2@staff.local`, 't123')
ck('logins', !!admin && !!juma && !!rehema, true)

try {
  console.log('\nTimetable — create, clash, move, swap')
  let r = await api('/api/timetable', admin, { method: 'POST', body: JSON.stringify({ classId: clsA.id, dayOfWeek: 1, startTime: '08:00', endTime: '08:45', subjectId: maths.id, staffId: t1.id, room: 'B2' }) })
  ck('create Maths Mon 08:00 for Form 1 (Juma)', r.status, 200)
  const s1 = r.body.slot
  r = await api('/api/timetable', admin, { method: 'POST', body: JSON.stringify({ classId: clsB.id, dayOfWeek: 1, startTime: '08:00', endTime: '08:45', subjectId: maths.id, staffId: t1.id }) })
  ck('same teacher, same time, other class → 409 clash', `${r.status}/${r.body.clash}`, '409/true')
  ck('  message names the clash', /already teaches/.test(r.body.error), true)
  r = await api('/api/timetable', admin, { method: 'POST', body: JSON.stringify({ classId: clsB.id, dayOfWeek: 1, startTime: '08:00', endTime: '08:45', subjectId: maths.id, staffId: t1.id, force: true }) })
  ck('  force overrides (cover)', r.status, 200)
  const s2 = r.body.slot
  r = await api('/api/timetable', admin, { method: 'POST', body: JSON.stringify({ classId: clsA.id, dayOfWeek: 1, startTime: '09:00', endTime: '09:45', subjectId: phys.id, staffId: t2.id }) })
  const s3 = r.body.slot
  r = await api('/api/timetable', admin, { method: 'POST', body: JSON.stringify({ classId: clsA.id, dayOfWeek: 2, startTime: '08:00', endTime: '07:00', subjectId: phys.id }) })
  ck('end before start 400', r.status, 400)
  r = await api('/api/timetable', admin, { method: 'PATCH', body: JSON.stringify({ id: s1.id, dayOfWeek: 2, startTime: '10:00', endTime: '10:45' }) })
  ck('move Maths to Tue 10:00', `${r.status}/${r.body.slot.dayOfWeek}/${r.body.slot.startTime}`, '200/2/10:00')
  r = await api('/api/timetable', admin, { method: 'PATCH', body: JSON.stringify({ id: s1.id, dayOfWeek: 1, startTime: '09:00', endTime: '09:45' }) })
  ck('move onto an occupied period → 409 occupied', `${r.status}/${r.body.occupied}`, '409/true')
  r = await api('/api/timetable', admin, { method: 'PATCH', body: JSON.stringify({ id: s1.id, dayOfWeek: 1, startTime: '09:00', endTime: '09:45', swap: true }) })
  ck('  swap 200 and reports the partner', `${r.status}/${r.body.swappedWith === s3.id}`, '200/true')
  const after = await prisma.timetableSlot.findUnique({ where: { id: s3.id } })
  ck('  partner took the vacated period (Tue 10:00)', `${after.dayOfWeek}/${after.startTime}`, '2/10:00')
  r = await api('/api/timetable', admin, { method: 'PATCH', body: JSON.stringify({ id: s3.id, dayOfWeek: 1, startTime: '08:00', endTime: '08:45', staffId: t1.id }) })
  ck('moving Physics with Juma onto Mon 08:00 clashes with his Form 2 lesson 409', `${r.status}/${r.body.clash}`, '409/true')
  r = await api('/api/timetable', admin, { method: 'PATCH', body: JSON.stringify({ id: s3.id, room: 'Lab 1', staffId: t2.id }) })
  ck('edit room/teacher without moving 200', `${r.status}/${r.body.slot.room}`, '200/Lab 1')
  r = await api(`/api/timetable?classId=${clsA.id}`, admin)
  ck('GET by class lists 2 lessons with names', `${r.body.slots.length}/${r.body.slots[0].subjectName.endsWith(TAG)}`, '2/true')
  r = await api(`/api/timetable?staffId=${t1.id}`, admin)
  ck('GET by teacher lists Juma’s 2 lessons across classes', r.body.slots.length, 2)

  console.log('\nTimetable — teacher access and pages')
  r = await api(`/api/timetable?staffId=${t2.id}`, juma)
  ck('teacher cannot read a colleague’s week 403', r.status, 403)
  r = await api(`/api/timetable?staffId=${t1.id}`, juma)
  ck('own week 200', r.status, 200)
  r = await api('/api/timetable', juma, { method: 'POST', body: JSON.stringify({ classId: clsA.id, dayOfWeek: 3, startTime: '08:00', endTime: '08:45', subjectId: maths.id }) })
  ck('teacher cannot write the timetable 403', r.status, 403)
  r = await page('/dashboard/timetable', admin)
  ck('admin page has the subject tray (drag and drop)', r.html.includes('drag into the grid') && r.html.includes('Drag a subject into a period'), true)
  r = await page('/dashboard/timetable', juma)
  ck('teacher page opens on My week, read-only', r.html.includes('My week') && !r.html.includes('drag into the grid'), true)
  r = await api(`/api/timetable/pdf?classId=${clsA.id}`, admin)
  let pdf = await pdfText(r.body)
  ck('class timetable PDF, landscape', `${r.type.includes('pdf')}/${pdf.pages[0][0] > pdf.pages[0][1]}`, 'true/true')
  ck('  shows lessons and teacher', pdf.text.includes(`Maths ${TAG}`) && pdf.text.includes('Juma'), true)
  r = await api(`/api/timetable/pdf?staffId=${t1.id}`, juma)
  pdf = await pdfText(r.body)
  ck('teacher prints own week: both classes named', pdf.text.includes(`Form 1 ${TAG}`) && pdf.text.includes(`Form 2 ${TAG}`), true)
  r = await api(`/api/timetable/pdf?staffId=${t2.id}`, juma)
  ck('  not a colleague’s 403', r.status, 403)
  r = await api(`/api/timetable?id=${s2.id}`, admin, { method: 'DELETE' })
  ck('clear a lesson 200', r.status, 200)

  console.log('\nSeating plan')
  r = await api(`/api/seating?classId=${clsA.id}`, rehema)
  ck('class teacher loads the plan (empty, 5×6, 8 on roll, canEdit)', `${r.status}/${r.body.plan.rows}x${r.body.plan.cols}/${r.body.roll.length}/${r.body.canEdit}`, '200/5x6/8/true')
  r = await api(`/api/seating?classId=${clsA.id}`, juma)
  ck('subject teacher of the class may view but not edit', `${r.status}/${r.body.canEdit}`, '200/false')
  const seats = pupils.slice(0, 6).map((p, i) => ({ studentId: p.id, row: Math.floor(i / 3), col: i % 3 }))
  r = await api('/api/seating', rehema, { method: 'PUT', body: JSON.stringify({ classId: clsA.id, rows: 4, cols: 5, seats }) })
  ck('class teacher saves 6 of 8 seated in a 4×5 grid', r.status, 200)
  r = await api('/api/seating', juma, { method: 'PUT', body: JSON.stringify({ classId: clsA.id, rows: 4, cols: 5, seats }) })
  ck('subject teacher cannot save 403', r.status, 403)
  r = await api('/api/seating', rehema, { method: 'PUT', body: JSON.stringify({ classId: clsA.id, rows: 4, cols: 5, seats: [...seats, { studentId: pupils[6].id, row: 0, col: 0 }] }) })
  ck('two pupils on one seat 400', r.status, 400)
  r = await api('/api/seating', rehema, { method: 'PUT', body: JSON.stringify({ classId: clsA.id, rows: 4, cols: 5, seats: [{ studentId: pupils[0].id, row: 0, col: 0 }, { studentId: pupils[0].id, row: 1, col: 1 }] }) })
  ck('pupil seated twice 400', r.status, 400)
  r = await api('/api/seating', rehema, { method: 'PUT', body: JSON.stringify({ classId: clsA.id, rows: 2, cols: 2, seats: [{ studentId: pupils[0].id, row: 3, col: 0 }] }) })
  ck('seat outside the grid 400', r.status, 400)
  const outsider = await prisma.student.findFirst({ where: { schoolId: school.id, classId: { not: clsA.id } }, select: { id: true } })
  r = await api('/api/seating', rehema, { method: 'PUT', body: JSON.stringify({ classId: clsA.id, rows: 4, cols: 5, seats: [{ studentId: outsider.id, row: 0, col: 0 }] }) })
  ck('pupil from another class 400', r.status, 400)
  r = await api(`/api/seating?classId=${clsA.id}`, admin)
  ck('saved plan round-trips (6 seats, 4×5)', `${r.body.plan.seats.length}/${r.body.plan.rows}x${r.body.plan.cols}`, '6/4x5')
  await prisma.student.update({ where: { id: pupils[0].id }, data: { status: 'TRANSFERRED' } })
  r = await api(`/api/seating?classId=${clsA.id}`, admin)
  ck('a pupil who left drops off the chart (5 seats)', r.body.plan.seats.length, 5)
  await prisma.student.update({ where: { id: pupils[0].id }, data: { status: 'ACTIVE' } })
  r = await api(`/api/seating?classId=${clsA.id}&format=pdf`, rehema)
  pdf = await pdfText(r.body)
  ck('seating chart PDF, landscape, front bar, names', `${r.type.includes('pdf')}/${pdf.pages[0][0] > pdf.pages[0][1]}/${pdf.text.includes('FRONT')}/${pdf.text.includes(`Pupil2 Test${TAG}`)}`, 'true/true/true/true')
  ck('  lists unseated pupils', pdf.text.includes('2 unseated'), true)
  r = await api(`/api/seating?classId=${clsB.id}`, rehema)
  ck('class not on her load 403', r.status, 403)
  r = await page(`/dashboard/seating?classId=${clsA.id}`, rehema)
  ck('seating page renders for the class teacher', r.status === 200 && r.html.includes('Seating plan'), true)
  r = await page('/dashboard/classes', admin)
  ck('classes page links to the seating plan', r.html.includes('/dashboard/seating?classId='), true)
  const audit = await prisma.auditLog.count({ where: { schoolId: school.id, entity: { in: ['TimetableSlot', 'SeatPlan'] } } })
  ck('audit rows for timetable and seating', audit >= 8, true)
} finally {
  await cleanup()
  await prisma.$disconnect()
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
