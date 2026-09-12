import type { Metadata } from 'next'
import { PageBanner } from '@/components/marketing/page-banner'
import { COMPANY_NAME, CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from '@/lib/site'

export const metadata: Metadata = { title: 'Terms of service', description: 'The terms under which Shule SMS is provided to schools.' }

/** Plain-language terms. A lawyer should review before the first paid contract; nothing here is invented beyond what the product does. */
export default function TermsPage() {
  const sections: [string, string][] = [
    ['Who we are', `Shule SMS is provided by ${COMPANY_NAME} ("we"). These terms apply to every school that registers an account, and to the people the school gives logins to.`],
    ['The service', 'Shule SMS is a hosted school management system: pupil and staff records, attendance, exams and report cards, fees and receipts, SMS and notices, HR and payroll, accounting and related documents. We may improve or change features; we will not remove a capability a school depends on without notice.'],
    ['Your account', 'The person who registers a school becomes its administrator and is responsible for the logins they create. Keep passwords private, use the roles provided so staff see only their own work, and tell us at once if you believe an account has been misused.'],
    ['Free and paid plans', 'A school may use Shule SMS free of charge for up to 50 pupils. Above that, a subscription is quoted per school from the number of pupils and the levels taught, invoiced monthly in Tanzanian shillings with 14 days to pay. If an invoice is not settled the school becomes read-only — every record stays visible — until it is; nothing is deleted.'],
    ['Your data', 'The school owns its data. We host it, isolate it from every other school, back it up every night, and export it to the school on request, including after the school leaves. We use it only to provide the service and never sell it. Personal data of pupils, parents and staff is processed on the school\'s instructions.'],
    ['SMS and email', 'Messages to parents are sent through the school\'s own SMS account (charged by the SMS provider per segment) and through our mail server. The school is responsible for the content it sends and for having parents\' consent to be contacted.'],
    ['Acceptable use', 'Do not use the service to store or send unlawful, abusive or misleading content, to attempt to access another school\'s data, or to interfere with the service. We may suspend an account that does.'],
    ['Availability and support', 'We aim for the service to be available at all times, and maintain it with notice where possible. Support is available by phone and WhatsApp during Tanzanian business hours.'],
    ['Liability', 'We provide the service with reasonable care and skill. To the extent permitted by law, we are not liable for indirect loss, and our total liability to a school in any year is limited to the subscription fees paid by that school in that year.'],
    ['Ending the service', 'A school may stop at any time; we will export its data on request and delete it after 90 days unless asked to keep it. We may end the service to a school for breach of these terms with 30 days\' notice, or at once for serious misuse.'],
    ['Changes and contact', `We may update these terms and will notify administrators by email of material changes. Questions: ${CONTACT_EMAIL}, ${CONTACT_PHONE_DISPLAY}.`],
  ]
  return (
    <>
      <PageBanner eyebrow="Legal" accent="blue" title="Terms of service" description="Written to be read by a head teacher, not only by a lawyer. Last updated September 2026." />
      <section className="mx-auto max-w-3xl px-5 py-12">
        <ol className="space-y-8">{sections.map(([h, b], i) => <li key={h}><h2 className="font-display text-xl font-semibold">{i + 1}. {h}</h2><p className="mt-2 leading-relaxed text-muted-foreground">{b}</p></li>)}</ol>
      </section>
    </>
  )
}
