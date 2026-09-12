// End-to-end test of the academics CRUD (subjects, academic years, terms).
// Logs in as the demo accounts itself, so it needs only a running dev server:
//   node scripts/academics-test.mjs [baseUrl]

const B = process.argv[2] ?? 'http://127.0.0.1:3000'

/** Logs in via the NextAuth credentials flow and returns a Cookie header. */
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

  const csrfRes = await fetch(`${B}/api/auth/csrf`)
  keep(csrfRes)
  const { csrfToken } = await csrfRes.json()

  const res = await fetch(`${B}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${B}/dashboard` }),
    redirect: 'manual',
  })
  keep(res)
  const out = cookie()
  if (!out.includes('session-token')) throw new Error(`login failed for ${email}`)
  return out
}

const admin = await login('admin@kilimanjaro.tz', 'admin123')
const parent = await login('parent@kilimanjaro.tz', 'parent123')

async function call(method, path, body, cookie = admin) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

let pass = 0, fail = 0
function ck(label, actual, expected) {
  const ok = String(actual) === String(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${actual}${ok ? '' : ` (want ${expected})`}`)
  ok ? pass++ : fail++
}

console.log('== SUBJECTS ==')
const mk = await call('POST', '/api/subjects', { name: 'Kiswahili Fasihi', code: 'kisf', description: 'Literature' })
ck('create', mk.status, 200)
const SID = mk.json?.id
ck('code upper-cased', mk.json?.code, 'KISF')
ck('duplicate code blocked', (await call('POST', '/api/subjects', { name: 'Other', code: 'KISF' })).status, 409)
ck('blank name rejected', (await call('POST', '/api/subjects', { name: '   ' })).status, 400)
ck('rename', (await call('PATCH', '/api/subjects', { id: SID, name: 'Fasihi' })).status, 200)
ck('renamed value', (await call('GET', '/api/subjects')).json?.find((s) => s.id === SID)?.name, 'Fasihi')
ck('delete unused', (await call('DELETE', `/api/subjects?id=${SID}`)).status, 200)

const subjects = (await call('GET', '/api/subjects')).json ?? []
const inUse = subjects.find((s) => s._count.exams > 0 || s._count.timetableSlots > 0)
const del = await call('DELETE', `/api/subjects?id=${inUse.id}`)
ck('delete in-use blocked', del.status, 409)
console.log(`        message: ${del.json?.error}`)

console.log('== ACADEMIC YEARS ==')
const yearsBefore = (await call('GET', '/api/academic-years')).json ?? []
const currentBefore = yearsBefore.filter((y) => y.isCurrent).length
const y = await call('POST', '/api/academic-years', { name: '2027', startDate: '2027-01-05', endDate: '2027-12-05', isCurrent: true })
ck('create', y.status, 200)
const YID = y.json?.id
ck('end before start rejected', (await call('POST', '/api/academic-years', { name: 'B', startDate: '2027-06-01', endDate: '2027-01-01' })).status, 400)
ck('unparseable date rejected', (await call('POST', '/api/academic-years', { name: 'B', startDate: 'not-a-date', endDate: '2027-01-01' })).status, 400)

const yearsAfter = (await call('GET', '/api/academic-years')).json ?? []
ck('exactly one current YEAR', yearsAfter.filter((yy) => yy.isCurrent).length, 1)
ck('new year is the current one', yearsAfter.find((yy) => yy.isCurrent)?.id, YID)
ck('no other year left current', yearsAfter.filter((yy) => yy.isCurrent && yy.id !== YID).length, 0)

console.log('== TERMS ==')
const t = await call('POST', '/api/terms', { academicYearId: YID, name: 'Term 1', startDate: '2027-01-10', endDate: '2027-04-10', isCurrent: true })
ck('create', t.status, 200)
const TID = t.json?.id
const outside = await call('POST', '/api/terms', { academicYearId: YID, name: 'Bad', startDate: '2026-01-10', endDate: '2027-04-10' })
ck('dates outside year rejected', outside.status, 400)
console.log(`        message: ${outside.json?.error}`)
ck('unknown year 404', (await call('POST', '/api/terms', { academicYearId: 'nope', name: 'X', startDate: '2027-02-01', endDate: '2027-03-01' })).status, 404)
ck('edit term', (await call('PATCH', '/api/terms', { id: TID, name: 'Muhula 1' })).status, 200)

const termsNow = ((await call('GET', '/api/academic-years')).json ?? []).flatMap((yy) => yy.terms)
ck('exactly one current TERM school-wide', termsNow.filter((tt) => tt.isCurrent).length, 1)
ck('term renamed', termsNow.find((tt) => tt.id === TID)?.name, 'Muhula 1')

console.log('== FK GUARDS ==')
const seeded = yearsAfter.find((yy) => yy.id !== YID && yy._count.exams > 0)
const delYear = await call('DELETE', `/api/academic-years?id=${seeded.id}`)
ck('delete year with exams blocked', delYear.status, 409)
console.log(`        message: ${delYear.json?.error}`)

console.log('== CLEANUP ==')
ck('delete term', (await call('DELETE', `/api/terms?id=${TID}`)).status, 200)
ck('delete year', (await call('DELETE', `/api/academic-years?id=${YID}`)).status, 200)

console.log('== AUTHZ ==')
ck('parent POST subjects', (await call('POST', '/api/subjects', {}, parent)).status, 403)
ck('parent PATCH subjects', (await call('PATCH', '/api/subjects', {}, parent)).status, 403)
ck('parent DELETE subjects', (await call('DELETE', '/api/subjects?id=x', undefined, parent)).status, 403)
ck('parent GET subjects', (await call('GET', '/api/subjects', undefined, parent)).status, 403)
ck('parent POST academic-years', (await call('POST', '/api/academic-years', {}, parent)).status, 403)
ck('parent POST terms', (await call('POST', '/api/terms', {}, parent)).status, 403)
ck('anon GET subjects', (await call('GET', '/api/subjects', undefined, '')).status, 401)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
