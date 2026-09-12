// SMS to parents, including the NextSMS adapter driven against a stand-in server.
//   node scripts/sms-test.mjs [baseUrl]
//
// The NextSMS parts require the dev server started with:
//   SMS_PROVIDER=nextsms NEXTSMS_BASE_URL=http://127.0.0.1:2626 \
//   NEXTSMS_USERNAME=demo NEXTSMS_PASSWORD=secret NEXTSMS_SENDER_ID=SHULE

import { createRequire } from 'node:module'
import http from 'node:http'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const prisma = new PrismaClient()
const B = process.argv[2] ?? 'http://127.0.0.1:3000'
const FAKE_PORT = 2626

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

// ── A stand-in for NextSMS, so we can inspect exactly what we send ──
const received = []
let nextResponse = null // set to override the reply for a test
const fake = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    let parsed = null
    try { parsed = JSON.parse(body) } catch {}
    received.push({ path: req.url, method: req.method, auth: req.headers.authorization, contentType: req.headers['content-type'], body: parsed })

    if (nextResponse) {
      res.writeHead(nextResponse.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(nextResponse.body))
      nextResponse = null
      return
    }
    // Mirror the documented Infobip-style reply NextSMS returns.
    const tos = parsed?.messages ? parsed.messages.map((m) => m.to) : [parsed?.to]
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      messages: tos.map((to, i) => ({
        to,
        messageId: `fake-${Date.now()}-${i}`,
        status: { groupName: 'PENDING', name: 'PENDING_ENROUTE', description: 'Message sent to next instance' },
      })),
    }))
  })
})
await new Promise((r) => fake.listen(FAKE_PORT, '127.0.0.1', r))
console.log(`stand-in NextSMS listening on 127.0.0.1:${FAKE_PORT}\n`)

const admin = await login('admin@kilimanjaro.tz', 'admin123')
const parent = await login('parent@kilimanjaro.tz', 'parent123')
const school = await prisma.school.findFirst()
const cls = await prisma.class.findFirst({ where: { schoolId: school.id }, select: { id: true, name: true } })

const api = async (method, path, body, cookie = admin) => {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null; try { json = await r.json() } catch {}
  return { status: r.status, json }
}

const logsBefore = await prisma.smsLog.count()

console.log('== TRANSPORT STATUS ==')
const status = await api('GET', '/api/sms')
ck('office can read SMS status', status.status, 200)
ck('reports the active provider', status.json?.provider, 'nextsms')
ck('reports it is configured', status.json?.configured, true)

console.log('== SENDING TO ONE NUMBER ==')
received.length = 0
const one = await api('POST', '/api/sms', { audience: 'one', phone: '0712 345 678', text: 'Karibu Shule SMS' })
ck('accepted', one.status, 200)
ck('one message delivered', one.json?.delivered, 1)
ck('reached the provider', received.length, 1)
ck('used the single endpoint', received[0]?.path, '/api/sms/v1/text/single')
ck('sent as JSON POST', `${received[0]?.method} ${received[0]?.contentType}`, 'POST application/json')
ck('basic auth from credentials', received[0]?.auth, `Basic ${Buffer.from('demo:secret').toString('base64')}`)
ck('normalised the number', received[0]?.body?.to, '255712345678')
ck('sender id applied', received[0]?.body?.from, 'SHULE')
ck('carried the text', received[0]?.body?.text, 'Karibu Shule SMS')

console.log('== BROADCAST TO A CLASS ==')
received.length = 0
const classSend = await api('POST', '/api/sms', { audience: 'class-guardians', classId: cls.id, text: 'Mkutano wa wazazi Jumamosi.' })
ck('accepted', classSend.status, 200)
ck('used the bulk endpoint', received[0]?.path, '/api/sms/v1/text/multi')
ck('batched into one request', received.length, 1)
const batch = received[0]?.body?.messages ?? []
ck('one entry per guardian', batch.length, classSend.json?.requested)
ck('every number normalised', batch.every((m) => /^255\d{9}$/.test(m.to)), true)
ck('every entry carries the sender id', batch.every((m) => m.from === 'SHULE'), true)
console.log(`        ${classSend.json?.requested} parents in ${cls.name}, ${classSend.json?.segments} segment(s)`)

console.log('== DEDUPLICATION ==')
// A guardian of two children must not be texted twice.
const [a, b] = await prisma.student.findMany({ where: { schoolId: school.id }, take: 2, select: { id: true } })
await prisma.guardian.deleteMany({ where: { id: 'sms-shared-guardian' } })
await prisma.guardian.create({
  data: {
    id: 'sms-shared-guardian', firstName: 'Shared', lastName: 'Parent', phone: '0755000111',
    students: { create: [{ studentId: a.id }, { studentId: b.id }] },
  },
})
received.length = 0
const all = await api('POST', '/api/sms', { audience: 'all-guardians', text: 'Taarifa muhimu.' })
const sentTo = (received[0]?.body?.messages ?? []).map((m) => m.to)
ck('shared parent texted once', sentTo.filter((t) => t === '255755000111').length, 1)
ck('no duplicate numbers at all', new Set(sentTo).size, sentTo.length)

console.log('== BAD NUMBERS ==')
const badPhone = await api('POST', '/api/sms', { audience: 'one', phone: '12345', text: 'Hi' })
ck('rejected before reaching the provider', badPhone.status, 400)
ck('message explains the format', /valid Tanzanian number/i.test(badPhone.json?.error ?? ''), true)

console.log('== PROVIDER FAILURES ARE REPORTED, NOT SWALLOWED ==')
received.length = 0
nextResponse = { status: 401, body: { requestError: { serviceException: { text: 'Invalid login details' } } } }
const rejected = await api('POST', '/api/sms', { audience: 'one', phone: '0713111222', text: 'Test' })
ck('request still answers 200', rejected.status, 200)
ck('nothing counted as delivered', rejected.json?.delivered, 0)
ck('failure surfaced to the office', /Invalid login details/.test(rejected.json?.failures?.[0]?.error ?? ''), true)

received.length = 0
nextResponse = {
  status: 200,
  body: { messages: [{ to: '255714222333', messageId: 'x1', status: { groupName: 'REJECTED', description: 'Not enough credit' } }] },
}
const noCredit = await api('POST', '/api/sms', { audience: 'one', phone: '0714222333', text: 'Test' })
ck('provider-level rejection detected', noCredit.json?.delivered, 0)
ck('reason passed through', /Not enough credit/.test(noCredit.json?.failures?.[0]?.error ?? ''), true)

console.log('== EVERY ATTEMPT IS LOGGED ==')
const logsAfter = await prisma.smsLog.count()
ck('SmsLog now has rows', logsAfter > logsBefore, true)
const failedLog = await prisma.smsLog.findFirst({ where: { schoolId: school.id, status: { startsWith: 'failed' } }, orderBy: { createdAt: 'desc' } })
ck('failures recorded with a reason', /failed:/.test(failedLog?.status ?? ''), true)
const okLog = await prisma.smsLog.findFirst({ where: { schoolId: school.id, status: 'sent' }, orderBy: { createdAt: 'desc' } })
ck('successes recorded', okLog?.status, 'sent')
console.log(`        ${logsAfter - logsBefore} rows written this run`)

console.log('== COST PREVIEW ==')
const preview = await api('PATCH', '/api/sms', { audience: 'all-guardians', text: 'a'.repeat(200) })
ck('preview available', preview.status, 200)
ck('counts recipients', preview.json?.recipients > 0, true)
ck('200 chars is 2 segments', preview.json?.segments, 2)
ck('total = reachable x segments', preview.json?.totalSegments, preview.json?.reachable * 2)

console.log('== ACCESS ==')
ck('a parent cannot broadcast', (await api('POST', '/api/sms', { audience: 'all-guardians', text: 'x' }, parent)).status, 403)
ck('a parent cannot read the log', (await api('GET', '/api/sms', undefined, parent)).status, 403)
ck('anonymous rejected', (await api('POST', '/api/sms', { audience: 'all-guardians', text: 'x' }, '')).status, 401)
ck('empty message rejected', (await api('POST', '/api/sms', { audience: 'all-guardians', text: '   ' })).status, 400)
ck('unknown class rejected', (await api('POST', '/api/sms', { audience: 'class-guardians', classId: 'nope', text: 'x' })).status, 404)

console.log('== AUDIT ==')
const entry = await prisma.auditLog.findFirst({ where: { entity: 'SmsBroadcast' }, orderBy: { createdAt: 'desc' } })
ck('broadcasts are audited', /Sent SMS to/.test(entry?.summary ?? ''), true)
ck('audit names the provider', /via nextsms/.test(entry?.summary ?? ''), true)

// Cleanup.
await prisma.studentGuardian.deleteMany({ where: { guardianId: 'sms-shared-guardian' } })
await prisma.guardian.deleteMany({ where: { id: 'sms-shared-guardian' } })
await prisma.smsLog.deleteMany({ where: { schoolId: school.id } })
await new Promise((r) => fake.close(r))

await prisma.$disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
