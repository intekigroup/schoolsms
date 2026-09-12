// Self-serve registration (3-step data), academic year + terms, lead notifications, onboarding checklist, CSV pupil import.
//   node scripts/signup-onboarding-test.mjs [baseUrl]

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
  return { status: r.status, body: type.includes('json') ? await r.json().catch(() => ({})) : await r.text() }
}
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: cookie ? { Cookie: cookie } : {} }); return { status: r.status, html: (await r.text()).replace(/<!--.*?-->/g, '') } }

const TAG = 'SOT'
const EMAIL = `head.${TAG.toLowerCase()}@x.tz`
const SCHOOL = `Test School ${TAG}`
async function cleanup() {
  const schools = (await prisma.school.findMany({ where: { name: SCHOOL }, select: { id: true } })).map((s) => s.id)
  if (!schools.length) return
  const users = (await prisma.user.findMany({ where: { schoolId: { in: schools } }, select: { id: true } })).map((u) => u.id)
  const students = (await prisma.student.findMany({ where: { schoolId: { in: schools } }, select: { id: true } })).map((s) => s.id)
  const gIds = (await prisma.studentGuardian.findMany({ where: { studentId: { in: students } }, select: { guardianId: true } })).map((g) => g.guardianId)
  await prisma.studentGuardian.deleteMany({ where: { studentId: { in: students } } })
  if (gIds.length) await prisma.guardian.deleteMany({ where: { id: { in: gIds } } })
  await prisma.student.deleteMany({ where: { id: { in: students } } })
  await prisma.journalLine.deleteMany({ where: { entry: { schoolId: { in: schools } } } }); await prisma.journalEntry.deleteMany({ where: { schoolId: { in: schools } } })
  await prisma.feePayment.deleteMany({ where: { schoolId: { in: schools } } }); await prisma.feeStructure.deleteMany({ where: { schoolId: { in: schools } } })
  await prisma.class.deleteMany({ where: { schoolId: { in: schools } } })
  await prisma.term.deleteMany({ where: { academicYear: { schoolId: { in: schools } } } })
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: schools } } })
  await prisma.schoolSubscription.deleteMany({ where: { schoolId: { in: schools } } })
  if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } }); await prisma.notification.deleteMany({ where: { userId: { in: users } } }); await prisma.verificationToken.deleteMany({ where: { OR: users.map((u) => ({ identifier: { endsWith: u } })) } }).catch(() => {}); await prisma.user.deleteMany({ where: { id: { in: users } } }) }
  await prisma.school.deleteMany({ where: { id: { in: schools } } })
  await prisma.notification.deleteMany({ where: { title: 'New school registered', message: { contains: SCHOOL } } })
}
await cleanup()

console.log('\n# Signup validation')
const base = { name: 'Neema Mushi', email: EMAIL, phone: '0745 111 222', jobTitle: 'Head teacher', password: 'Strong#Pass9', schoolName: SCHOOL, shortName: 'TSSOT', schoolType: 'FAITH', levels: ['PRIMARY', 'O_LEVEL'], approxPupils: 300, region: 'Kilimanjaro', district: 'Moshi', address: 'Rau ward', motto: 'Elimu ni ufunguo', academicYear: 2026, terms: [{ name: 'Term 1', startDate: '2026-01-12', endDate: '2026-03-27' }, { name: 'Term 2', startDate: '2026-05-04', endDate: '2026-08-14' }, { name: 'Term 3', startDate: '2026-09-07', endDate: '2026-11-27' }], preferredLocale: 'sw', referralSource: 'WHATSAPP', acceptTerms: true }
const post = (b) => api('/api/signup', null, { method: 'POST', body: JSON.stringify(b) })
let r = await post({ ...base, acceptTerms: false }); ck('terms not accepted -> 400', r.status, 400); ck('  field = acceptTerms', r.body.field, 'acceptTerms')
r = await post({ ...base, levels: [] }); ck('no levels -> 400', r.status, 400); ck('  field = levels', r.body.field, 'levels')
r = await post({ ...base, region: 'Atlantis' }); ck('unknown region -> 400', r.status, 400); ck('  field = region', r.body.field, 'region')
r = await post({ ...base, phone: '12' }); ck('bad phone -> 400', r.status, 400); ck('  field = phone', r.body.field, 'phone')
r = await post({ ...base, password: 'short' }); ck('short password -> 400', r.status, 400)
r = await post({ ...base, terms: [{ name: 'Term 1', startDate: '2026-03-01', endDate: '2026-02-01' }] }); ck('term ends before start -> 400', r.status, 400); ck('  field = terms', r.body.field, 'terms')
r = await post({ ...base, terms: [{ name: 'Term 1', startDate: '2026-01-01', endDate: '2026-04-01' }, { name: 'Term 2', startDate: '2026-03-01', endDate: '2026-06-01' }] }); ck('overlapping terms -> 400', r.status, 400)
r = await post({ ...base, role: 'SUPER_ADMIN' }); ck('happy path -> 200', r.status, 200)
ck('  requiresVerification', r.body.requiresVerification, true)
ck('  role forced to SCHOOL_ADMIN', r.body.user?.role, 'SCHOOL_ADMIN')
r = await post(base); ck('duplicate email -> 409', r.status, 409)

console.log('\n# What signup created')
const school = await prisma.school.findFirst({ where: { name: SCHOOL }, include: { subscription: true, academicYears: { include: { terms: { orderBy: { startDate: 'asc' } } } } } })
ck('school exists', !!school, true)
ck('shortName', school.shortName, 'TSSOT'); ck('schoolType', school.schoolType, 'FAITH'); ck('levels', school.schoolLevel.join(','), 'PRIMARY,O_LEVEL')
ck('approxPupils', school.approxPupils, 300); ck('region/district', `${school.region}/${school.district}`, 'Kilimanjaro/Moshi'); ck('city falls back to district', school.city, 'Moshi')
ck('school phone from admin phone', school.phone, '+255745111222'); ck('school email falls back to admin', school.email, EMAIL)
ck('preferredLocale', school.preferredLocale, 'sw'); ck('referralSource', school.referralSource, 'WHATSAPP'); ck('termsAcceptedAt set', !!school.termsAcceptedAt, true)
ck('FREE subscription, 50 pupils', `${school.subscription.plan}/${school.subscription.maxStudents}`, 'FREE/50')
ck('one current academic year', school.academicYears.filter((y) => y.isCurrent).length, 1)
ck('  named 2026', school.academicYears[0].name, '2026'); ck('  3 terms', school.academicYears[0].terms.length, 3)
ck('  Term 1 is current', school.academicYears[0].terms[0].isCurrent, true); ck('  Term 3 ends 27 Nov', school.academicYears[0].terms[2].endDate.toISOString().slice(0, 10), '2026-11-27')
const admin = await prisma.user.findUnique({ where: { email: EMAIL } })
ck('admin phone normalised', admin.phone, '+255745111222'); ck('admin jobTitle', admin.jobTitle, 'Head teacher'); ck('admin locale', admin.locale, 'sw'); ck('unverified', admin.emailVerified, null)
const supers = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } })
const leads = await prisma.notification.count({ where: { userId: { in: supers.map((s) => s.id) }, title: 'New school registered', message: { contains: SCHOOL } } })
ck('super admins notified of the lead', leads, supers.length)
const tok = await prisma.verificationToken.findFirst({ where: { identifier: { endsWith: admin.id } } }).catch(() => null)
ck('verification token issued', !!tok, true)

console.log('\n# Verification gate + onboarding checklist')
ck('cannot log in before verifying', await login(EMAIL, 'Strong#Pass9'), null)
await prisma.user.update({ where: { id: admin.id }, data: { emailVerified: new Date() } })
const c = await login(EMAIL, 'Strong#Pass9'); ck('login after verify', !!c, true)
r = await api('/api/onboarding', c); ck('GET /api/onboarding', r.status, 200)
ck('  11 steps', r.body.total, 11); ck('  verify done', r.body.steps.find((s) => s.key === 'verify').done, true); ck('  year done', r.body.steps.find((s) => s.key === 'year').done, true)
ck('  profile not done yet (no logo)', r.body.steps.find((s) => s.key === 'profile').done, false); ck('  pupils not done', r.body.steps.find((s) => s.key === 'pupils').done, false)
ck('  not dismissed', r.body.dismissed, false)
let d = await page('/dashboard', c); ck('dashboard shows checklist', d.html.includes(`Getting ${SCHOOL} running`), true)
r = await api('/api/onboarding', c, { method: 'PATCH', body: JSON.stringify({ dismissed: true }) }); ck('PATCH dismiss', r.body.dismissed, true)
d = await page('/dashboard', c); ck('dashboard hides checklist after dismiss', d.html.includes(`Getting ${SCHOOL} running`), false)
await api('/api/onboarding', c, { method: 'PATCH', body: JSON.stringify({ dismissed: false }) })

console.log('\n# CSV import')
const raw = async (path, body, cookie = c) => { const r = await fetch(B + path, { method: 'POST', headers: { 'Content-Type': 'text/csv', Cookie: cookie }, body }); return { status: r.status, body: await r.json().catch(() => ({})) } }
const tpl = await fetch(`${B}/api/students/import?template=1`, { headers: { Cookie: c } })
ck('template downloads', tpl.status, 200); ck('  csv content-type', (tpl.headers.get('content-type') ?? '').includes('text/csv'), true)
const tplText = await tpl.text(); ck('  header row', tplText.split('\n')[0], 'admissionNo,firstName,lastName,gender,dateOfBirth,class,guardianName,guardianPhone,relationship')
r = await raw('/api/students/import', 'admissionNo,firstName\nX,Y\n'); ck('missing columns -> 400', r.status, 400)
const csv = ['admissionNo,firstName,lastName,gender,dateOfBirth,class,guardianName,guardianPhone,relationship',
  'SOT-001,Amina,Juma,F,2014-03-15,Std 1,Fatuma Juma,0745000001,Mother',
  'SOT-002,Baraka,Juma,M,15/07/2013,Std 2,Fatuma Juma,0745000001,Mother',      // sibling → same guardian
  'SOT-003,"Mwita, Jr",Peter,male,2015-01-01,Form 1,Peter Mwita,0755000002,Father',
  'SOT-004,Bad,Gender,X,2015-01-01,Std 1,,,',                                 // bad gender
  'SOT-005,Bad,Date,F,yesterday,Std 1,,,',                                    // bad date
  'SOT-001,Dup,Row,F,2014-01-01,Std 1,,,',                                    // duplicate in file
  'SOT-006,No,Phone,F,2014-01-01,Std 1,Some Parent,,',                        // guardian without phone
  'SOT-007,Zawadi,Ally,F,2014-01-01,Std 1,,,'].join('\r\n') + '\r\n'
r = await raw('/api/students/import?dryRun=1', csv); ck('dry run -> 200', r.status, 200)
ck('  importable = 4', r.body.importable, 4); ck('  errors = 4', r.body.errors.length, 4); ck('  new classes', r.body.newClasses.join('|'), 'Std 1|Std 2|Form 1')
ck('  nothing created on dry run', await prisma.student.count({ where: { schoolId: school.id } }), 0)
r = await raw('/api/students/import', csv); ck('import -> 200', r.status, 200)
ck('  imported = 4', r.body.imported, 4); ck('  guardians created = 2', r.body.guardiansCreated, 2); ck('  guardians reused = 1', r.body.guardiansReused, 1)
const pupils = await prisma.student.findMany({ where: { schoolId: school.id }, include: { class: true, guardians: { include: { guardian: true } } }, orderBy: { admissionNo: 'asc' } })
ck('  4 pupils in db', pupils.length, 4); ck('  quoted name kept', pupils[2].firstName, 'Mwita, Jr'); ck('  DD/MM/YYYY parsed', pupils[1].dateOfBirth.toISOString().slice(0, 10), '2013-07-15')
ck('  Form 1 → O_LEVEL', pupils[2].class.level, 'O_LEVEL'); ck('  siblings share a guardian', pupils[0].guardians[0].guardianId === pupils[1].guardians[0].guardianId, true)
ck('  guardian phone normalised', pupils[0].guardians[0].guardian.phone, '+255745000001')
r = await raw('/api/students/import', csv); ck('re-import of same file -> all rows rejected', r.body.imported ?? 0, 0)
ck('  duplicates reported by line', r.body.errors.some((e) => /already exists/.test(e.error)), true)
const big = ['admissionNo,firstName,lastName,gender,dateOfBirth,class', ...Array.from({ length: 60 }, (_, i) => `SOT-B${i},P${i},Q,F,2014-01-01,Std 3`)].join('\n')
r = await raw('/api/students/import?dryRun=1', big); ck('plan limit: 46 of 60 importable on FREE', r.body.importable, 46); ck('  overLimit = 14', r.body.overLimit, 14)
r = await api('/api/onboarding', c); ck('checklist: pupils now done', r.body.steps.find((s) => s.key === 'pupils').done, true); ck('  guardians done', r.body.steps.find((s) => s.key === 'guardians').done, true); ck('  classes still needs subjects', r.body.steps.find((s) => s.key === 'classes').done, false)
const audit = await prisma.auditLog.findFirst({ where: { actorId: admin.id, entity: 'Student', action: 'create' }, orderBy: { createdAt: 'desc' } })
ck('audit row for the import', /Imported 4 pupil/.test(audit?.summary ?? ''), true)

console.log('\n# School profile, logo and letterhead')
const sharp = require('../node_modules/sharp')
r = await api('/api/settings', c); ck('GET /api/settings', r.status, 200); ck('  shortName from signup', r.body.shortName, 'TSSOT'); ck('  schoolType from signup', r.body.schoolType, 'FAITH'); ck('  poBox empty', r.body.poBox, null)
const put = (b) => api('/api/settings', c, { method: 'PUT', body: JSON.stringify(b) })
r = await put({ name: SCHOOL, region: 'Atlantis' }); ck('PUT unknown region -> 400', r.status, 400); ck('  field = region', r.body.field, 'region')
r = await put({ name: SCHOOL, phone: 'abc' }); ck('PUT bad phone -> 400', r.status, 400)
r = await put({ name: SCHOOL, schoolLevel: [] }); ck('PUT no levels -> 400', r.status, 400)
r = await put({ name: SCHOOL, shortName: 'TSS', motto: 'Elimu ni ufunguo', schoolType: 'PRIVATE', schoolLevel: ['NURSERY', 'PRIMARY'], registrationNo: 'S.1234', email: 'office@tssot.tz', phone: '0755 000 111', website: 'www.tssot.ac.tz', address: 'Rau ward', poBox: 'P.O. Box 1234 Moshi', district: 'Moshi', region: 'Kilimanjaro', approxPupils: 420, preferredLocale: 'en' })
ck('PUT full profile -> 200', r.status, 200)
ck('  phone normalised', r.body.phone, '+255755000111'); ck('  website gets https', r.body.website, 'https://www.tssot.ac.tz'); ck('  "P.O. Box" prefix stripped', r.body.poBox, '1234 Moshi')
ck('  levels', r.body.schoolLevel.join(','), 'NURSERY,PRIMARY'); ck('  registrationNo', r.body.registrationNo, 'S.1234'); ck('  city mirrors district', r.body.city, 'Moshi'); ck('  approxPupils', r.body.approxPupils, 420)
ck('  logoUrl not settable via PUT', (await put({ name: SCHOOL, logoUrl: 'data:image/png;base64,AAAA' })).body.logoUrl, null)
r = await api('/api/onboarding', c); ck('profile step needs a logo', r.body.steps.find((s) => s.key === 'profile').done, false)
const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 4, g: 112, b: 148, alpha: 1 } } }).png().toBuffer()
const upload = async (cookie, buf) => { const fd = new FormData(); fd.set('kind', 'logo'); fd.set('file', new Blob([buf], { type: 'image/png' }), 'logo.png'); const x = await fetch(B + '/api/photos', { method: 'POST', headers: { Cookie: cookie }, body: fd }); return { status: x.status, body: await x.json().catch(() => ({})) } }
r = await upload(c, png); ck('logo upload -> 200', r.status, 200); ck('  stored as PNG data URL', String(r.body.photoUrl).startsWith('data:image/png;base64,'), true); ck('  small (< 20 KB)', r.body.bytes < 20000, true)
r = await upload(c, Buffer.from('not an image')); ck('garbage logo -> 400', r.status, 400)
ck('logo saved on the school', String((await api('/api/settings', c)).body.logoUrl).slice(0, 14), 'data:image/png')
r = await api('/api/onboarding', c); ck('profile step done after logo', r.body.steps.find((s) => s.key === 'profile').done, true)
// The letterhead: fee statement for an imported pupil carries P.O. Box, reg. no and the logo image.
const pupil = await prisma.student.findFirst({ where: { schoolId: school.id }, select: { id: true } })
const pdfRes = await fetch(B + '/api/reports/fee-statement?studentId=' + pupil.id, { headers: { Cookie: c } })
ck('fee statement PDF -> 200', pdfRes.status, 200)
const pdf = Buffer.from(await pdfRes.arrayBuffer()); const latin = pdf.toString('latin1')
const { inflateSync } = require('node:zlib'); let drawn = ''
for (const m of latin.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) { try { const t = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); for (const h of t.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) drawn += Buffer.from(h[1], 'hex').toString('latin1') + '\n' } catch {} }
ck('  letterhead has P.O. Box line', /P\.O\. Box 1234 Moshi, Rau ward, Kilimanjaro/.test(drawn), true)
ck('  letterhead has reg. no + website (no protocol)', /Reg\. No\. S\.1234/.test(drawn) && /  www\.tssot\.ac\.tz/.test(drawn) && !/https:\/\/www\.tssot/.test(drawn), true)
ck('  logo image embedded', /\/Subtype\s*\/Image/.test(latin), true)
r = await api('/api/photos?kind=logo', c, { method: 'DELETE' }); ck('DELETE logo -> 200', r.status, 200); ck('  logoUrl cleared', (await api('/api/settings', c)).body.logoUrl, null)

console.log('\n# Document numbers are per school (regression: unique indexes were platform-wide)')
const kili = await prisma.student.findFirst({ where: { schoolId: 'school-kilimanjaro' }, select: { id: true, schoolId: true } })
const kiliFee = await prisma.feeStructure.findFirst({ where: { schoolId: 'school-kilimanjaro' }, select: { id: true } })
const sotFee = await prisma.feeStructure.create({ data: { schoolId: school.id, name: 'Tuition SOT', amount: 1000 } })
const sotPupil = await prisma.student.findFirst({ where: { schoolId: school.id }, select: { id: true } })
const kPay = await prisma.feePayment.create({ data: { studentId: kili.id, schoolId: kili.schoolId, feeStructureId: kiliFee.id, amount: 100, receiptNo: 'RCP-2099-00001' } })
let sPay = null
if (sotFee) { sPay = await prisma.feePayment.create({ data: { studentId: sotPupil.id, schoolId: school.id, feeStructureId: sotFee.id, amount: 100, receiptNo: 'RCP-2099-00001' } }).catch((e) => ({ error: e.code })) }
ck('two schools can both issue RCP-2099-00001', sPay && !sPay.error, true)
const kJe = await prisma.journalEntry.create({ data: { schoolId: 'school-kilimanjaro', number: 'JE-2099-00001', date: new Date('2099-01-01'), memo: 'SOT regression', source: 'MANUAL', sourceId: `sot-${Date.now()}` } })
const sJe = await prisma.journalEntry.create({ data: { schoolId: school.id, number: 'JE-2099-00001', date: new Date('2099-01-01'), memo: 'SOT regression', source: 'MANUAL', sourceId: `sot2-${Date.now()}` } }).catch((e) => ({ error: e.code }))
ck('two schools can both post JE-2099-00001', !sJe.error, true)
ck('but the same school cannot reuse a number', (await prisma.journalEntry.create({ data: { schoolId: school.id, number: 'JE-2099-00001', date: new Date('2099-01-01'), memo: 'dup', source: 'MANUAL', sourceId: `sot3-${Date.now()}` } }).catch((e) => e.code)), 'P2002')
await prisma.journalEntry.deleteMany({ where: { id: { in: [kJe.id, sJe.id].filter(Boolean) } } })
await prisma.feePayment.deleteMany({ where: { id: { in: [kPay.id, sPay?.id].filter(Boolean) } } })
if (sotFee) await prisma.feeStructure.delete({ where: { id: sotFee.id } })

console.log('\n# Other roles')
const bcrypt = require('../node_modules/bcryptjs')
await prisma.user.create({ data: { email: `bursar.${TAG.toLowerCase()}@x.tz`, name: 'Bursar', role: 'ACCOUNTANT', hashedPassword: await bcrypt.hash('acc123', 10), schoolId: school.id, emailVerified: new Date() } })
const acc = await login(`bursar.${TAG.toLowerCase()}@x.tz`, 'acc123')
r = await raw('/api/students/import?dryRun=1', csv, acc); ck('accountant cannot import', r.status, 403)
r = await api('/api/onboarding', acc); ck('accountant can read checklist', r.status, 200)
r = await api('/api/onboarding', acc, { method: 'PATCH', body: JSON.stringify({ dismissed: true }) }); ck('accountant cannot dismiss', r.status, 403)
r = await api('/api/settings', acc); ck('accountant can read the profile', r.status, 200)
r = await api('/api/settings', acc, { method: 'PUT', body: JSON.stringify({ name: 'X' }) }); ck('accountant cannot edit the profile', r.status, 403)
r = await upload(acc, png); ck('accountant cannot upload the logo', r.status, 403)
r = await api('/api/onboarding', null); ck('anonymous -> 401', r.status, 401)

console.log('\n# Public pages')
for (const p of ['/signup', '/terms', '/privacy']) { const x = await page(p); ck(`${p} renders`, x.status, 200) }
ck('signup page has the wizard', (await page('/signup')).html.includes('Register your school'), true)
ck('terms mention the free tier', (await page('/terms')).html.includes('up to 50 pupils'), true)

await cleanup()
console.log(`\n${pass} passed, ${fail} failed`)
await prisma.$disconnect()
process.exit(fail ? 1 : 0)
