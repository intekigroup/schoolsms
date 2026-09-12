// End-to-end test of the password reset + change-password flow.
// Needs a running dev server and DB access (it reads the emailed link from the
// token table, since no email provider is configured).
//   node scripts/password-reset-test.mjs [baseUrl]

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.prisma/client')
const prisma = new PrismaClient()

const B = process.argv[2] ?? 'http://127.0.0.1:3000'
const EMAIL = 'resettest@kilimanjaro.tz'
const ORIGINAL = 'original-pass-123'

let pass = 0, fail = 0
function ck(label, actual, expected) {
  const ok = String(actual) === String(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${actual}${ok ? '' : ` (want ${expected})`}`)
  ok ? pass++ : fail++
}

async function post(path, body) {
  const res = await fetch(B + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

/** Full credentials login; returns a Cookie header or null. */
async function login(email, password) {
  const jar = new Map()
  const keep = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      jar.set(pair.slice(0, i), pair.slice(i + 1))
    }
  }
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const csrfRes = await fetch(`${B}/api/auth/csrf`); keep(csrfRes)
  const { csrfToken } = await csrfRes.json()
  const res = await fetch(`${B}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }),
    redirect: 'manual',
  })
  keep(res)
  const out = cookie()
  return out.includes('session-token') ? out : null
}

const bcrypt = require('bcryptjs')
const school = await prisma.school.findFirst()
await prisma.user.deleteMany({ where: { email: EMAIL } })
const user = await prisma.user.create({
  data: {
    email: EMAIL, name: 'Reset Test', role: 'TEACHER', schoolId: school.id,
    hashedPassword: await bcrypt.hash(ORIGINAL, 12),
    // Login now requires a confirmed address.
    emailVerified: new Date(),
  },
})
console.log(`setup: created ${EMAIL}\n`)

console.log('== FORGOT PASSWORD ==')
ck('unknown email still 200', (await post('/api/auth/forgot-password', { email: 'nobody@nowhere.tz' })).status, 200)
const unknownBody = (await post('/api/auth/forgot-password', { email: 'nobody@nowhere.tz' })).json
const knownRes = await post('/api/auth/forgot-password', { email: EMAIL })
ck('known email 200', knownRes.status, 200)
ck('identical message (no enumeration)', knownRes.json?.message, unknownBody?.message)
ck('reports email not configured', knownRes.json?.emailConfigured, false)
ck('invalid email rejected', (await post('/api/auth/forgot-password', { email: 'nope' })).status, 400)
ck('no token for unknown user', await prisma.verificationToken.count({ where: { identifier: 'password-reset:nobody' } }), 0)

// Recover the raw token the way the user would (from the link); we can only
// verify the hash is what's stored, so mint a known one through the endpoint
// and match by hash.
const tokensFor = async () => prisma.verificationToken.findMany({ where: { identifier: `password-reset:${user.id}` } })
ck('token row created', (await tokensFor()).length >= 1, true)
ck('token stored hashed, not raw', (await tokensFor())[0].token.length, 64)

console.log('== THROTTLE ==')
await post('/api/auth/forgot-password', { email: EMAIL })
await post('/api/auth/forgot-password', { email: EMAIL })
await post('/api/auth/forgot-password', { email: EMAIL })
ck('caps active tokens at 3', (await tokensFor()).length, 3)

console.log('== RESET ==')
// Simulate the link: create a token directly through the same helper path by
// hashing a value we control and inserting it (mirrors createResetToken).
await prisma.verificationToken.deleteMany({ where: { identifier: `password-reset:${user.id}` } })
const RAW = 'test-token-abcdefghijklmnop'
await prisma.verificationToken.create({
  data: {
    identifier: `password-reset:${user.id}`,
    token: createHash('sha256').update(RAW).digest('hex'),
    expires: new Date(Date.now() + 30 * 60_000),
  },
})
ck('short password rejected', (await post('/api/auth/reset-password', { token: RAW, password: 'short' })).status, 400)
ck('bogus token rejected', (await post('/api/auth/reset-password', { token: 'nope', password: 'newpassword123' })).status, 400)
ck('valid reset', (await post('/api/auth/reset-password', { token: RAW, password: 'newpassword123' })).status, 200)
ck('token consumed (single use)', (await tokensFor()).length, 0)
ck('replay rejected', (await post('/api/auth/reset-password', { token: RAW, password: 'another123456' })).status, 400)

console.log('== LOGIN WITH NEW PASSWORD ==')
ck('old password no longer works', await login(EMAIL, ORIGINAL), null)
const cookie = await login(EMAIL, 'newpassword123')
ck('new password works', Boolean(cookie), true)

console.log('== EXPIRED TOKEN ==')
await prisma.verificationToken.create({
  data: {
    identifier: `password-reset:${user.id}`,
    token: createHash('sha256').update('expired-token-xyz').digest('hex'),
    expires: new Date(Date.now() - 60_000),
  },
})
ck('expired token rejected', (await post('/api/auth/reset-password', { token: 'expired-token-xyz', password: 'yetanother123' })).status, 400)

console.log('== CHANGE PASSWORD (signed in) ==')
async function change(body, c) {
  const res = await fetch(`${B}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(c ? { Cookie: c } : {}) },
    body: JSON.stringify(body),
  })
  return res.status
}
ck('anonymous rejected', await change({ currentPassword: 'x', newPassword: 'abcdefgh1' }, null), 401)
ck('wrong current password', await change({ currentPassword: 'wrong', newPassword: 'abcdefgh1' }, cookie), 403)
ck('same as current rejected', await change({ currentPassword: 'newpassword123', newPassword: 'newpassword123' }, cookie), 400)
ck('too short rejected', await change({ currentPassword: 'newpassword123', newPassword: 'abc' }, cookie), 400)
ck('valid change', await change({ currentPassword: 'newpassword123', newPassword: 'finalpassword123' }, cookie), 200)
ck('login with changed password', Boolean(await login(EMAIL, 'finalpassword123')), true)

console.log('== PAGES ==')
const page = async (p) => (await fetch(B + p, { redirect: 'manual' })).status
ck('/forgot-password renders', await page('/forgot-password'), 200)
ck('/reset-password renders', await page('/reset-password'), 200)
ck('/reset-password?token=bogus renders', await page('/reset-password?token=bogus'), 200)

await prisma.user.deleteMany({ where: { email: EMAIL } })
await prisma.$disconnect()
console.log(`\ncleanup: removed ${EMAIL}`)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
