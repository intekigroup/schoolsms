// Runs every suite in scripts/ against the dev server and fails if any fails.
//   npm test            (dev server on :3000 with the seeded local database)
//   npm test -- --only siblings,parent-portal
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const only = (process.argv.find((a) => a.startsWith('--only')) ?? '').split('=')[1]?.split(',').filter(Boolean)
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'
const files = readdirSync('scripts').filter((f) => /-test\.mjs$|^feature-review\.mjs$|^saas-audit\.mjs$/.test(f) && f !== 'run-all-tests.mjs').sort()
  .filter((f) => !only || only.some((o) => f.includes(o)))

const ping = await fetch(`${base}/login`).then((r) => r.status).catch(() => 0)
if (ping !== 200) { console.error(`No dev server at ${base} (got ${ping}). Start it with: npm run dev`); process.exit(2) }

const results = []
for (const f of files) {
  const t0 = Date.now()
  const r = spawnSync('node', [`scripts/${f}`, base], { encoding: 'utf8' })
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  const summary = out.split('\n').reverse().find((l) => /passed|checks OK|leaked/.test(l)) ?? (r.status === 0 ? 'ok' : 'crashed')
  const failed = r.status !== 0 || /\b[1-9]\d* failed\b/.test(summary) || /FAIL/.test(summary)
  results.push({ f, failed, summary: summary.trim(), secs: ((Date.now() - t0) / 1000).toFixed(0) })
  console.log(`${failed ? '✗' : '✓'} ${f.padEnd(34)} ${summary.trim()}  (${results.at(-1).secs}s)`)
  if (failed) console.log(out.split('\n').filter((l) => /FAIL|Error/.test(l)).slice(0, 8).map((l) => '    ' + l).join('\n'))
}
const bad = results.filter((r) => r.failed)
console.log(`\n${results.length - bad.length}/${results.length} suites passed`)
process.exit(bad.length ? 1 : 0)
