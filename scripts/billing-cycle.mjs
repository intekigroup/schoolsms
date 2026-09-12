// Runs the daily billing cycle from cron, without needing a login.
//
//   node scripts/billing-cycle.mjs
//
// Marks invoices overdue, expires lapsed subscriptions (which puts those
// schools in read-only), and raises the next period's invoices. Idempotent —
// running it twice in a day issues nothing extra.
//
// Example crontab entry, 02:00 daily:
//   0 2 * * * cd /path/to/nextjs_space && /path/to/node scripts/billing-cycle.mjs >> billing.log 2>&1

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { runBillingCycle } = await import('../lib/billing.ts').catch(async () => {
  // lib/billing.ts is TypeScript; run through tsx when called directly.
  console.error('Run this with tsx:  npx tsx scripts/billing-cycle.mjs')
  process.exit(1)
})

const report = await runBillingCycle()
console.log(`billing cycle ${report.ranAt}`)
console.log(`  invoices marked overdue: ${report.markedOverdue}`)
console.log(`  subscriptions expired:   ${report.expired.length}${report.expired.length ? ' — ' + report.expired.join(', ') : ''}`)
console.log(`  invoices issued:         ${report.issued.length}`)
for (const line of report.issued) console.log(`    ${line}`)
process.exit(0)
