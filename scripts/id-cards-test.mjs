// ID cards: design settings, photo upload, PDF cards (CR80 and A4 sheets), QR verification.
//   node scripts/id-cards-test.mjs [baseUrl]

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const bcrypt = require('../node_modules/bcryptjs')
const sharp = require('../node_modules/sharp')
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

async function pdfInfo(bytes) {
  const doc = await PDFDocument.load(bytes)
  let text = ''
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (!(obj instanceof PDFRawStream)) return
    let stream
    try { stream = Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1') } catch { return }
    for (const m of stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) text += Buffer.from(m[1], 'hex').toString('latin1') + '\n'
  })
  const pages = doc.getPages().map((p) => [Math.round(p.getWidth() * 10) / 10, Math.round(p.getHeight() * 10) / 10])
  // Embedded images: XObjects with Subtype /Image.
  const images = (Buffer.from(bytes).toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length
  return { text, pages, images }
}

const api = async (path, cookie, init = {}) => {
  const headers = { ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) }
  const r = await fetch(B + path, { ...init, headers, redirect: 'manual' })
  const type = r.headers.get('content-type') ?? ''
  const body = type.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : type.includes('json') ? await r.json().catch(() => ({})) : await r.text()
  return { status: r.status, type, body, disposition: r.headers.get('content-disposition') }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
const school = await prisma.school.findUnique({ where: { id: 'school-kilimanjaro' } })
// The demo school may carry a logo (Settings → profile); cards would embed it on every page, so hide it for the photo-count checks.
const savedLogo = school.logoUrl
if (savedLogo) await prisma.school.update({ where: { id: school.id }, data: { logoUrl: null } })
process.on('beforeExit', async () => { if (savedLogo) await prisma.school.update({ where: { id: school.id }, data: { logoUrl: savedLogo } }).catch(() => {}) })
const TAG = 'IDC'
const ids = { students: [], guardians: [], staff: [], users: [], class: null, otherSchool: null }

async function cleanup() {
  const st = [...new Set([...ids.students, ...(await prisma.student.findMany({ where: { schoolId: school.id, admissionNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)])]
  const gs = [...new Set([...ids.guardians, ...(await prisma.guardian.findMany({ where: { lastName: `Test${TAG}` }, select: { id: true } })).map((g) => g.id)])]
  const sf = [...new Set([...ids.staff, ...(await prisma.staff.findMany({ where: { schoolId: school.id, employeeNo: { startsWith: `${TAG}-` } }, select: { id: true } })).map((s) => s.id)])]
  const us = [...new Set([...ids.users, ...(await prisma.user.findMany({ where: { email: { endsWith: `.${TAG.toLowerCase()}@kilimanjaro.tz` } }, select: { id: true } })).map((u) => u.id)])]
  const cl = [...new Set([...(ids.class ? [ids.class] : []), ...(await prisma.class.findMany({ where: { schoolId: school.id, name: `Std 4 ${TAG}` }, select: { id: true } })).map((c) => c.id)])]
  const os = [...new Set([...(ids.otherSchool ? [ids.otherSchool] : []), ...(await prisma.school.findMany({ where: { name: `Other ${TAG}` }, select: { id: true } })).map((s) => s.id)])]
  if (st.length) { await prisma.studentGuardian.deleteMany({ where: { studentId: { in: st } } }); await prisma.student.deleteMany({ where: { id: { in: st } } }) }
  if (gs.length) await prisma.guardian.deleteMany({ where: { id: { in: gs } } })
  if (sf.length) await prisma.staff.deleteMany({ where: { id: { in: sf } } })
  if (cl.length) await prisma.class.deleteMany({ where: { id: { in: cl } } })
  if (us.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: us } } }); await prisma.user.deleteMany({ where: { id: { in: us } } }) }
  if (os.length) {
    await prisma.student.deleteMany({ where: { schoolId: { in: os } } })
    await prisma.schoolSubscription.deleteMany({ where: { schoolId: { in: os } } })
    await prisma.school.deleteMany({ where: { id: { in: os } } })
  }
  await prisma.idCardSettings.deleteMany({ where: { schoolId: school.id } })
}
await cleanup()

const cls = await prisma.class.create({ data: { name: `Std 4 ${TAG}`, level: 'PRIMARY', schoolId: school.id } })
ids.class = cls.id
const names = [['Neema', 'Test' + TAG], ['Juma', 'Test' + TAG], ['Zawadi', 'Test' + TAG]]
const pupils = []
for (const [i, [f, l]] of names.entries()) {
  const s = await prisma.student.create({ data: { admissionNo: `${TAG}-${i + 1}`, firstName: f, lastName: l, gender: i === 1 ? 'MALE' : 'FEMALE', dateOfBirth: new Date('2015-06-10'), schoolId: school.id, classId: cls.id, status: i === 2 ? 'TRANSFERRED' : 'ACTIVE' } })
  pupils.push(s); ids.students.push(s.id)
}
const guardian = await prisma.guardian.create({ data: { firstName: 'Mama', lastName: `Test${TAG}`, phone: '+255700000111', relationship: 'Mother' } })
ids.guardians.push(guardian.id)
await prisma.studentGuardian.create({ data: { studentId: pupils[0].id, guardianId: guardian.id, isPrimary: true } })
const staffRow = await prisma.staff.create({ data: { employeeNo: `${TAG}-S1`, firstName: 'Grace', lastName: `Test${TAG}`, gender: 'FEMALE', role: 'Mathematics teacher', phone: '+255700000222', schoolId: school.id } })
ids.staff.push(staffRow.id)
const teacher = await prisma.user.create({ data: { email: `teacher.${TAG.toLowerCase()}@kilimanjaro.tz`, name: 'T', role: 'TEACHER', hashedPassword: await bcrypt.hash('teach123', 10), schoolId: school.id, emailVerified: new Date() } })
ids.users.push(teacher.id)
const other = await prisma.school.create({ data: { name: `Other ${TAG}`, subscription: { create: { plan: 'FREE', maxStudents: 50, maxStaff: 10 } } } })
ids.otherSchool = other.id
const otherPupil = await prisma.student.create({ data: { admissionNo: `${TAG}-X`, firstName: 'Other', lastName: 'Pupil', gender: 'MALE', dateOfBirth: new Date('2015-01-01'), schoolId: other.id, status: 'ACTIVE' } })

const admin = await login('admin@kilimanjaro.tz', 'admin123')
const teach = await login(teacher.email, 'teach123')
ck('logins', !!admin && !!teach, true)

try {
  console.log('\nDesign settings')
  let r = await api('/api/settings/id-cards', admin)
  ck('GET defaults 200', r.status, 200)
  ck('default landscape, QR on, back on', `${r.body.config.orientation}/${r.body.config.qr.enabled}/${r.body.config.back.enabled}`, 'landscape/true/true')
  const defaults = r.body.config
  r = await api('/api/settings/id-cards', teach, { method: 'PUT', body: JSON.stringify({ config: defaults }) })
  ck('teacher cannot change design 403', r.status, 403)
  r = await api('/api/settings/id-cards', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, theme: { ...defaults.theme, accent: 'blue' } } }) })
  ck('bad colour rejected 400', r.status, 400)
  ck('  names the field', /theme\.accent/.test(r.body.error), true)
  r = await api('/api/settings/id-cards', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, theme: { ...defaults.theme, accent: '#7A1E2B' }, student: { ...defaults.student, validUntil: 'Dec 2026', title: 'MWANAFUNZI' } } }) })
  ck('valid design saved 200', r.status, 200)
  ck('  persisted', (await api('/api/settings/id-cards', admin)).body.config.student.title, 'MWANAFUNZI')

  console.log('\nPhotos')
  const jpg = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 120, b: 80 } } }).jpeg().toBuffer()
  let fd = new FormData(); fd.set('kind', 'student'); fd.set('id', pupils[0].id); fd.set('file', new Blob([jpg], { type: 'image/jpeg' }), 'neema.jpg')
  r = await api('/api/photos', admin, { method: 'POST', body: fd })
  ck('upload pupil photo 200', r.status, 200)
  ck('  stored as a JPEG data URL', String(r.body.photoUrl).startsWith('data:image/jpeg;base64,'), true)
  const meta = await sharp(Buffer.from(String(r.body.photoUrl).split(',')[1], 'base64')).metadata()
  ck('  resized to a 3:4 passport crop (360×480)', `${meta.width}x${meta.height}`, '360x480')
  ck('  under 40 KB', r.body.bytes < 40_000, true)
  fd = new FormData(); fd.set('kind', 'staff'); fd.set('id', staffRow.id); fd.set('file', new Blob([jpg], { type: 'image/jpeg' }), 'grace.jpg')
  r = await api('/api/photos', admin, { method: 'POST', body: fd })
  ck('upload staff photo 200', r.status, 200)
  fd = new FormData(); fd.set('kind', 'student'); fd.set('id', pupils[1].id); fd.set('file', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'x.txt')
  r = await api('/api/photos', admin, { method: 'POST', body: fd })
  ck('non-image refused 400', r.status, 400)
  fd = new FormData(); fd.set('kind', 'student'); fd.set('id', otherPupil.id); fd.set('file', new Blob([jpg], { type: 'image/jpeg' }), 'x.jpg')
  r = await api('/api/photos', admin, { method: 'POST', body: fd })
  ck("another school's pupil 404", r.status, 404)
  fd = new FormData(); fd.set('kind', 'student'); fd.set('id', pupils[0].id); fd.set('file', new Blob([jpg], { type: 'image/jpeg' }), 'x.jpg')
  r = await api('/api/photos', teach, { method: 'POST', body: fd })
  ck('teacher cannot upload 403', r.status, 403)

  console.log('\nHolders')
  r = await api(`/api/id-cards/holders?classId=${cls.id}`, admin)
  ck('lists active pupils in the class (2 of 3)', r.body.students.length, 2)
  ck('  carries the guardian line', r.body.students.find((s) => s.name.startsWith('Neema')).guardian, `Mama Test${TAG} · +255700000111`)
  ck('  carries the photo', String(r.body.students.find((s) => s.name.startsWith('Neema')).photoUrl).startsWith('data:image/jpeg'), true)

  console.log('\nCards — CR80')
  r = await api(`/api/id-cards?type=student&classId=${cls.id}`, admin)
  ck('class cards PDF 200', `${r.status}/${r.type.includes('pdf')}`, '200/true')
  let info = await pdfInfo(r.body)
  ck('  2 pupils × front+back = 4 pages', info.pages.length, 4)
  ck('  page is CR80 landscape (242.6 × 153.1 pt)', `${info.pages[0][0]}x${info.pages[0][1]}`, '242.6x153.1')
  ck('  names both pupils', info.text.includes('Neema') && info.text.includes('Juma'), true)
  ck('  inactive pupil excluded', info.text.includes('Zawadi'), false)
  ck('  uses the custom title', info.text.includes('MWANAFUNZI'), true)
  ck('  prints validity', info.text.includes('Valid until Dec 2026'), true)
  ck('  admission number', info.text.includes(`${TAG}-1`), true)
  ck('  guardian on front', info.text.includes('+255700000111'), true)
  ck('  back: emergency contact + return-to', info.text.includes('EMERGENCY CONTACT') && info.text.includes('IF FOUND, PLEASE RETURN TO'), true)
  ck('  back: signature label', info.text.includes('Head Teacher'), true)
  ck('  QR label', info.text.includes('SCAN TO VERIFY'), true)
  ck('  one embedded photo (Neema has one, Juma has initials)', info.images, 1)
  ck('  filename', r.disposition, `attachment; filename="id-cards-Std-4-${TAG}.pdf"`)

  r = await api(`/api/id-cards?type=student&ids=${pupils[1].id}`, admin)
  info = await pdfInfo(r.body)
  ck('single pupil by id → 2 pages', info.pages.length, 2)
  r = await api(`/api/id-cards?type=staff&ids=${staffRow.id}`, admin)
  info = await pdfInfo(r.body)
  ck('staff card 200', r.status, 200)
  ck('  employee no and position', info.text.includes(`${TAG}-S1`) && info.text.includes('Mathematics teacher'), true)
  ck('  STAFF title', info.text.includes('STAFF'), true)
  ck('  no emergency block for staff', info.text.includes('EMERGENCY CONTACT'), false)

  console.log('\nCards — A4 sheet')
  r = await api(`/api/id-cards?type=student&classId=${cls.id}&layout=sheet`, admin)
  info = await pdfInfo(r.body)
  ck('sheet is A4', `${info.pages[0][0]}x${info.pages[0][1]}`, '595.3x841.9')
  ck('  fronts page + backs page', info.pages.length, 2)
  ck('  filename says sheet', /-sheet\.pdf"$/.test(r.disposition), true)

  console.log('\nSettings drive the card')
  await api('/api/settings/id-cards', admin, { method: 'PUT', body: JSON.stringify({ config: { ...defaults, orientation: 'portrait', back: { ...defaults.back, enabled: false }, qr: { enabled: false }, student: { ...defaults.student, showGuardianPhone: false, showAdmissionNo: false } } }) })
  r = await api(`/api/id-cards?type=student&ids=${pupils[0].id}`, admin)
  info = await pdfInfo(r.body)
  ck('portrait page (153.1 × 242.6)', `${info.pages[0][0]}x${info.pages[0][1]}`, '153.1x242.6')
  ck('no back → 1 page', info.pages.length, 1)
  ck('QR off → no label', info.text.includes('SCAN TO VERIFY'), false)
  ck('guardian & admission hidden', info.text.includes('+255700000111') || info.text.includes(`${TAG}-1`), false)
  r = await api(`/api/id-cards?type=student&ids=${pupils[0].id}&layout=sheet`, admin)
  info = await pdfInfo(r.body)
  ck('sheet without backs → 1 page', info.pages.length, 1)
  await api('/api/settings/id-cards', admin, { method: 'PUT', body: JSON.stringify({ reset: true }) })

  console.log('\nQR verification')
  // Derive the token the way the server does, through the public page itself.
  const { createHmac } = await import('node:crypto')
  const secret = (await import('node:fs')).readFileSync('.env', 'utf8').match(/^AUTH_SECRET=["']?([^"'\n]+)/m)?.[1]
  const sig = (kind, id) => createHmac('sha256', secret).update(`idcard:${kind}:${id}`).digest('base64url').slice(0, 22)
  r = await api(`/verify/student/${pupils[0].id}.${sig('student', pupils[0].id)}`, null)
  ck('valid pupil card → public page 200', r.status, 200)
  ck('  says Valid card', r.body.includes('Valid card'), true)
  ck('  shows the name and class', r.body.includes('Neema') && r.body.includes(`Std 4 ${TAG}`), true)
  ck('  no admission number or guardian phone leaked', r.body.includes(`${TAG}-1`) || r.body.includes('+255700000111'), false)
  r = await api(`/verify/student/${pupils[2].id}.${sig('student', pupils[2].id)}`, null)
  ck('inactive pupil → "No longer current"', r.body.includes('No longer current'), true)
  r = await api(`/verify/student/${pupils[0].id}.${sig('student', pupils[0].id).replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))}`, null)
  ck('tampered signature → Not recognised', r.body.includes('Not recognised'), true)
  r = await api(`/verify/staff/${staffRow.id}.${sig('staff', staffRow.id)}`, null)
  ck('staff card verifies', r.body.includes('Valid card') && r.body.includes('Grace'), true)
  r = await api(`/verify/student/${staffRow.id}.${sig('staff', staffRow.id)}`, null)
  ck('staff signature does not verify as a pupil', r.body.includes('Not recognised'), true)
  r = await api(`/verify/other/${pupils[0].id}.abc`, null)
  ck('unknown kind → Not recognised', r.body.includes('Not recognised'), true)

  console.log('\nAccess & isolation')
  r = await api(`/api/id-cards?type=student&classId=${cls.id}`, teach)
  ck('teacher cannot generate cards 403', r.status, 403)
  r = await api(`/api/id-cards?type=student&classId=${cls.id}`, null)
  ck('anonymous 401', r.status, 401)
  r = await api(`/api/id-cards?type=student&ids=${otherPupil.id}`, admin)
  ck("another school's pupil → 404 (no card)", r.status, 404)
  r = await api(`/api/id-cards?type=student`, admin)
  ck('no selection 400', r.status, 400)
  r = await api(`/api/id-cards?type=bus&all=1`, admin)
  ck('bad type 400', r.status, 400)
  r = await api(`/api/photos?kind=student&id=${pupils[0].id}`, admin, { method: 'DELETE' })
  ck('remove photo 200', r.status, 200)
  ck('  cleared', (await prisma.student.findUnique({ where: { id: pupils[0].id }, select: { photoUrl: true } })).photoUrl, null)
  const audit = await prisma.auditLog.count({ where: { schoolId: school.id, entity: { in: ['IdCard', 'IdCardSettings'] } } })
  ck('audit trail for cards and design', audit >= 8, true)
} finally {
  await cleanup()
  await prisma.$disconnect()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
