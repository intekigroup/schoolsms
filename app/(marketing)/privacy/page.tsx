import type { Metadata } from 'next'
import { PageBanner } from '@/components/marketing/page-banner'
import { COMPANY_NAME, CONTACT_EMAIL } from '@/lib/site'

export const metadata: Metadata = { title: 'Privacy policy', description: 'How Shule SMS handles the personal data of pupils, parents and staff.' }

export default function PrivacyPage() {
  const sections: [string, string][] = [
    ['What we hold', 'For each school: pupil records (names, dates of birth, class, attendance, marks, fees, photos when uploaded), guardian contact details, staff employment and payroll records, and the school\'s own documents. Plus the account details of the people who log in.'],
    ['Why', 'Only to run the school\'s administration on its instructions: registers, report cards, receipts, SMS to parents, payslips and accounts. We do not use the data for advertising and we do not sell it.'],
    ['Where it lives', 'On servers operated by ' + COMPANY_NAME + ' for Tanzanian schools, with every school\'s data isolated from every other. Backups are taken every night and kept for 30 days.'],
    ['Who can see it', 'The school\'s own users, each limited to their role: teachers see the classes they teach, parents and pupils see only their own records, accountants see finance. Our staff access a school\'s data only to provide support the school has asked for, and every such access is logged.'],
    ['Messages', 'SMS to parents is sent through the school\'s SMS provider; email through our mail server. Delivery logs (number, time, status) are kept so the school can see what was sent.'],
    ['Your rights', 'A school may export all of its data at any time and may ask us to correct or delete records. A parent, pupil or staff member should ask their school, which controls the records; we act on the school\'s instructions.'],
    ['Security', 'Encrypted connections, hashed passwords, account lockout after repeated failures, email confirmation for new accounts, sessions that end everywhere when a password changes, and an audit trail of who changed what.'],
    ['Retention', 'Data is kept while the school uses the service. After a school leaves it is exported on request and deleted after 90 days unless the school asks us to keep it.'],
    ['Contact', `Questions about privacy: ${CONTACT_EMAIL}.`],
  ]
  return (
    <>
      <PageBanner eyebrow="Legal" accent="green" title="Privacy policy" description="Pupils' marks and parents' phone numbers are exactly the kind of data that must be handled carefully. This is how we do it. Last updated September 2026." />
      <section className="mx-auto max-w-3xl px-5 py-12">
        <ol className="space-y-8">{sections.map(([h, b], i) => <li key={h}><h2 className="font-display text-xl font-semibold">{i + 1}. {h}</h2><p className="mt-2 leading-relaxed text-muted-foreground">{b}</p></li>)}</ol>
      </section>
    </>
  )
}
