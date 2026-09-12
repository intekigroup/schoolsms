// Language: every key has Swahili, the choice is saved on the account, and the portals render in Kiswahili.
//   node scripts/i18n-test.mjs [baseUrl]

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
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
const api = async (path, cookie, init = {}) => { const r = await fetch(B + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, redirect: 'manual' }); return { status: r.status, body: await r.json().catch(() => ({})) } }
const page = async (path, cookie) => { const r = await fetch(B + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }); return { status: r.status, html: (await r.text()).replace(/<!--.*?-->/g, '') } }

console.log('\n# Dictionary')
const src = readFileSync(new URL('../lib/i18n.ts', import.meta.url), 'utf8')
const entries = [...src.matchAll(/^\s*'([a-zA-Z0-9.]+)':\s*\{\s*en:\s*(['"])((?:\\.|(?!\2).)*)\2,\s*sw:\s*(['"])((?:\\.|(?!\4).)*)\4\s*\}/gm)].map((m) => ({ key: m[1], en: m[3], sw: m[5] }))
ck('at least 300 keys', entries.length >= 300, true)
const untranslated = entries.filter((e) => !e.sw.trim() || (e.sw === e.en && !/^(O-Level|A-Level|Shule SMS|SMS|PDF|TZS|Excel)/.test(e.en)))
ck('every key has a Swahili value different from English', untranslated.map((e) => e.key).join(',') || 'none', 'none')
const dupes = entries.map((e) => e.key).filter((k, i, a) => a.indexOf(k) !== i)
ck('no duplicate keys', dupes.join(',') || 'none', 'none')
// Every t('key') used in the dashboard must exist.
const { execSync } = require('node:child_process')
const used = new Set(execSync(`grep -rhoE "\\bt\\('[a-zA-Z0-9.]+'" "app/(dashboard)" components | sort -u`, { cwd: decodeURIComponent(new URL('..', import.meta.url).pathname), encoding: 'utf8' }).split('\n').filter(Boolean).map((s) => s.slice(3, -1)))
const known = new Set(entries.map((e) => e.key))
const missing = [...used].filter((k) => !known.has(k))
ck('every t() key used in the app is defined', missing.join(',') || 'none', 'none')

console.log('\n# Saved language and rendered portals')
const TAG = 'I18'
const K = 'school-kilimanjaro'
const users = await prisma.user.findMany({ where: { email: { endsWith: `.${TAG.toLowerCase()}@x.tz` } }, select: { id: true } })
if (users.length) { await prisma.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } }); await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } }) }
await prisma.guardian.deleteMany({ where: { lastName: `Guardian${TAG}` } })
await prisma.student.deleteMany({ where: { admissionNo: { startsWith: `${TAG}-` } } })
await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
await prisma.class.deleteMany({ where: { name: { endsWith: ` ${TAG}` } } })
const pw = await bcrypt.hash('pass1234', 10)
const cls = await prisma.class.create({ data: { name: `Std 1 ${TAG}`, level: 'PRIMARY', schoolId: K } })
const pupil = await prisma.student.create({ data: { admissionNo: `${TAG}-1`, firstName: 'Zuri', lastName: 'Kid', gender: 'FEMALE', dateOfBirth: new Date('2017-01-01'), schoolId: K, classId: cls.id } })
const mamaUser = await prisma.user.create({ data: { email: `mama.${TAG.toLowerCase()}@x.tz`, name: 'Mama I18', role: 'PARENT', hashedPassword: pw, schoolId: K, emailVerified: new Date(), locale: 'sw' } })
await prisma.guardian.create({ data: { firstName: 'Mama', lastName: `Guardian${TAG}`, phone: '+255700000444', userId: mamaUser.id, students: { create: [{ studentId: pupil.id, isPrimary: true }] } } })
const pupilUser = await prisma.user.create({ data: { email: `pupil.${TAG.toLowerCase()}@x.tz`, name: 'Zuri Kid', role: 'STUDENT', hashedPassword: pw, schoolId: K, emailVerified: new Date(), locale: 'en', student: { connect: { id: pupil.id } } } })
const mama = await login(`mama.${TAG.toLowerCase()}@x.tz`, 'pass1234'); const zuri = await login(`pupil.${TAG.toLowerCase()}@x.tz`, 'pass1234')
ck('logins', !!(mama && zuri), true)
let r = await api('/api/auth/locale', zuri, { method: 'PUT', body: JSON.stringify({ locale: 'sw' }) }); ck('PUT /api/auth/locale sw', r.status, 200)
ck('  saved on the account', (await prisma.user.findUnique({ where: { id: pupilUser.id } })).locale, 'sw')
r = await api('/api/auth/locale', zuri, { method: 'PUT', body: JSON.stringify({ locale: 'fr' }) }); ck('unknown locale -> 400', r.status, 400)
r = await api('/api/auth/locale', null, { method: 'PUT', body: JSON.stringify({ locale: 'sw' }) }); ck('anonymous -> 401', r.status, 401)
// A fresh sign-in picks up the saved language (the JWT reads locale from the account).
const zuri2 = await login(`pupil.${TAG.toLowerCase()}@x.tz`, 'pass1234')
let p = await page('/dashboard/my', zuri2); ck('pupil portal renders', p.status, 200)
ck('  "No school assigned" fallback not shown', p.html.includes('No school assigned'), false)
ck('  server-rendered in Kiswahili (Matokeo yangu)', p.html.includes('Matokeo yangu'), true)
p = await page('/dashboard/parents', mama); ck('parent portal renders', p.status, 200); ck('  server-rendered in Kiswahili (Mahudhurio)', p.html.includes('Mahudhurio'), true); ck('  and not in English', p.html.includes('Recent Results'), false)
p = await page('/dashboard/timetable', mama); ck('read-only banner absent for an active school', p.html.includes('subscription is'), false)

await prisma.guardian.deleteMany({ where: { lastName: `Guardian${TAG}` } })
await prisma.student.deleteMany({ where: { id: pupil.id } })
await prisma.auditLog.deleteMany({ where: { actorId: { in: [mamaUser.id, pupilUser.id] } } })
await prisma.notification.deleteMany({ where: { userId: { in: [mamaUser.id, pupilUser.id] } } })
await prisma.user.deleteMany({ where: { id: { in: [mamaUser.id, pupilUser.id] } } })
await prisma.class.delete({ where: { id: cls.id } })
console.log(`\n${pass} passed, ${fail} failed`)
await prisma.$disconnect()
process.exit(fail ? 1 : 0)
