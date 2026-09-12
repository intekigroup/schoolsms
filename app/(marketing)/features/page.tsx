import type { Metadata } from 'next'
import { PageBanner } from '@/components/marketing/page-banner'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReportCardVignette, ReceiptVignette, SmsVignette } from '@/components/marketing/vignettes'

export const metadata: Metadata = {
  title: 'Features — Shule SMS',
  description:
    'Every module in Shule SMS: students and guardians, academics, attendance, exams and report cards, fees in TZS, SMS to parents, library, hostel, transport and more.',
}

type Group = {
  id: string
  eyebrow: string
  title: string
  intro: string
  items: { name: string; body: string }[]
  vignette?: React.ReactNode
}

const GROUPS: Group[] = [
  {
    id: 'academics',
    eyebrow: 'Academics',
    title: 'The register, the marks, the report card.',
    intro: 'The daily and end-of-term work of teaching, kept in one place and printed when it matters.',
    vignette: <ReportCardVignette />,
    items: [
      { name: 'Academic years and terms', body: 'Define the year, split it into terms, mark one as current. Everything else — exams, timetables, fees — hangs off it.' },
      { name: 'Subjects and classes', body: 'From Standard 1 to Form 6, with streams. Assign subjects and a class teacher.' },
      { name: 'Timetable', body: 'Per class, per weekday. Pupils see their own class timetable in the portal.' },
      { name: 'Attendance register', body: 'Present, absent, late or excused, per pupil per day. Reload any date to see what was recorded.' },
      { name: 'Exams and mark sheets', body: 'Set an exam for a class and subject; enter marks in one screen. A teacher submits the sheet, the office reviews, returns or publishes it, and a published sheet is locked. Only published marks reach parents.' },
      { name: 'Class results', body: 'Weighted term marks per subject (CAT and end-of-term by your weights), A–F grades and points on your own scale, class and subject positions, Division I–IV on the best seven for O-level, subject analysis, teacher remarks.' },
      { name: 'Report cards and class sheets as PDF', body: 'Report card per pupil or per class, landscape class results sheet, subject analysis and performance summary — every option set under Settings → Reports.' },
    ],
  },
  {
    id: 'money',
    eyebrow: 'Fees',
    title: 'Shillings in, receipts out.',
    intro: 'Fee structures per class or school-wide, payments by any method a parent uses, and statements a family can take home.',
    vignette: <ReceiptVignette />,
    items: [
      { name: 'Fee structures', body: 'Tuition, boarding, transport, or anything else — per class, or applied to the whole school.' },
      { name: 'Payments and receipts', body: 'Cash, bank, M-Pesa, Tigo Pesa or Airtel Money. Every payment gets a unique receipt number, even when several cashiers are working at once.' },
      { name: 'Fee statements as PDF', body: 'What was billed, what was paid with receipt numbers, and the balance outstanding.' },
      { name: 'Parents notified', body: 'A linked parent gets an in-app notification the moment a payment is recorded.' },
    ],
  },
  {
    id: 'people',
    eyebrow: 'People',
    title: 'Pupils, parents, staff — and their logins.',
    intro: 'Enrolment is more than a name in a list. Families are linked, and everyone who needs a login can be given one from the office.',
    items: [
      { name: 'Students', body: 'Enrol, edit, move between classes, mark as graduated or transferred. History is protected: a pupil with marks or payments cannot be deleted by accident.' },
      { name: 'Guardians', body: 'Attach parents to pupils — siblings share one guardian record. Phone and email on file for SMS and portal access.' },
      { name: 'Staff', body: 'Teachers and office staff with roles: what a librarian sees is not what a bursar sees.' },
      { name: 'Portal logins', body: 'Create a pupil or parent login in a click. The temporary password is shown once, for the office to hand over.' },
      { name: 'Parent portal', body: 'Attendance, fee balance and recent results for each child, read-only.' },
      { name: 'Student portal', body: 'Own results, attendance, fee balance, timetable and library loans — and their own report card and fee statement to download.' },
    ],
  },
  {
    id: 'communication',
    eyebrow: 'Communication',
    title: 'Reach parents where they are.',
    intro: 'Notices on the board for staff, SMS for parents — the channel that actually gets read.',
    vignette: <SmsVignette />,
    items: [
      { name: 'SMS to parents', body: 'Broadcast to every parent, one class, or a single number. Numbers are normalised, duplicates removed, and the segment cost shown before you send.' },
      { name: 'Announcements', body: 'A notice board for the school, public or staff-only, with in-app notifications fanned out automatically.' },
      { name: 'Events calendar', body: 'Upcoming and past events with dates.' },
    ],
  },
  {
    id: 'operations',
    eyebrow: 'Operations',
    title: 'The rest of running a school.',
    intro: 'Boarding, transport and the library, without a separate spreadsheet for each.',
    items: [
      { name: 'Library', body: 'Books and copies, issue and return with due dates, fines calculated on return.' },
      { name: 'Hostel', body: 'Dormitories and rooms with bed capacity; assign pupils and see who is where.' },
      { name: 'Transport', body: 'Routes and vehicles; assign pupils to a route.' },
      { name: 'Reports', body: 'CSV exports of students, staff, fees, attendance, library and grades for the spreadsheet you still need.' },
    ],
  },
  {
    id: 'teaching',
    eyebrow: 'Teaching',
    title: 'A portal shaped like a teacher\'s day.',
    intro: 'Each teacher sees the classes and subjects on their teaching load — and nothing else.',
    items: [
      { name: 'Teacher home', body: 'Today\'s lessons, registers still to mark, mark sheets still incomplete, leave balance, notices.' },
      { name: 'Teaching load', body: 'Class teacher of one class; subjects per class or in every class. This decides what every teacher-facing page shows.' },
      { name: 'Timetable builder', body: 'Drag a subject into a period, drag a lesson to move it, drop on another to swap. A teacher booked in two classes at once is flagged and refused unless the office overrides. Printable per class or per teacher.' },
      { name: 'Seating plans', body: 'Drag pupils onto desks, swap, auto-fill A–Z or boy–girl, print the chart with the front of the room at the top.' },
      { name: 'Homework and lesson notes', body: 'Posted to a class, optionally per subject, with a due date. Parents and pupils see them and get a notification.' },
      { name: 'Messages', body: 'Teacher ↔ guardian conversations, always about one pupil, with unread counts and read marks. Guardians can write to the class teacher, subject teachers and the office.' },
    ],
  },
  {
    id: 'hr',
    eyebrow: 'HR & payroll',
    title: 'From contract to payslip.',
    intro: 'Employment records, leave, staff attendance and a monthly payroll that follows Tanzanian statute.',
    items: [
      { name: 'Employment records', body: 'Type, department, hire date, contract end, TIN, NSSF number, bank details, recurring allowances and deductions.' },
      { name: 'Leave', body: 'Entitlements per type (annual, sick, maternity, paternity…), requests counted in working days, approval queue, balances; staff request their own.' },
      { name: 'Staff attendance', body: 'Daily register with one-click marks and a monthly summary; staff on approved leave are flagged automatically.' },
      { name: 'Payroll', body: 'Draft → approve → paid. PAYE on the TRA bands, NSSF employee and employer, SDL and WCF; payslip PDF per person, payroll register with remittances, bank CSV. Staff download their own payslips.' },
    ],
  },
  {
    id: 'accounting',
    eyebrow: 'Accounting',
    title: 'Double-entry books that fill themselves in.',
    intro: 'Every fee receipt and every paid payroll posts to the ledger automatically; the bursar adds expenses.',
    items: [
      { name: 'Chart of accounts', body: 'A Tanzanian school chart seeded on first use — cash, bank, mobile money, fee income by type, staff costs, statutory payables — and editable.' },
      { name: 'Expenses and journal', body: 'Record what was paid, to whom, from which account; manual entries with a live balance check; void with a reason.' },
      { name: 'Statements', body: 'Income statement, balance sheet, trial balance, cash book, budget vs actual and debtors ageing — on screen, PDF or CSV.' },
      { name: 'ID cards', body: 'Passport-photo upload, CR80 cards or A4 sheets for the laminator, a school-wide design, and a QR code that verifies the holder on any phone.' },
    ],
  },
  {
    id: 'platform',
    eyebrow: 'Platform',
    title: 'Kept like a system of record.',
    intro: 'Behind the screens, the things that matter when the data is real.',
    items: [
      { name: 'Audit trail', body: 'Every payment, mark entry, login created and document printed is attributed to who did it and when.' },
      { name: 'Roles and access', body: 'Seven roles, each seeing only its own work. Parents and pupils see only their own records.' },
      { name: 'Per-school isolation', body: 'One school can never read or change another school\'s records.' },
      { name: 'Backups', body: 'Your school can be exported and restored on its own, without touching any other.' },
      { name: 'Security', body: 'Email verification, password reset, account lockout, and sessions that end everywhere when a password changes.' },
      { name: 'Works on a phone', body: 'Responsive throughout, installable on a home screen, and honest about being offline.' },
    ],
  },
]

export default function FeaturesPage() {
  return (
    <>
      <PageBanner
        eyebrow="Features"
        accent="blue"
        title="Everything the office does, in one system."
        description="Seventeen modules across academics, money, people, communication and operations. Pick a section, or read straight through."
      >
        <nav className="flex flex-wrap gap-2" aria-label="Sections">
          {GROUPS.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-sm text-white/85 hover:border-white/50 hover:bg-white/10">
              {g.eyebrow}
            </a>
          ))}
        </nav>
      </PageBanner>

      {GROUPS.map((g, i) => (
        <section key={g.id} id={g.id} className={`scroll-mt-20 ${i % 2 ? 'bg-muted/30 border-y border-border' : ''}`}>
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1fr_1.4fr]">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{g.eyebrow}</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">{g.title}</h2>
              <p className="mt-3 text-muted-foreground">{g.intro}</p>
              {g.vignette && <div className="mt-6 max-w-sm">{g.vignette}</div>}
            </div>
            <dl className="grid gap-5 sm:grid-cols-2">
              {g.items.map((it) => (
                <div key={it.name} className="rounded-xl border border-border bg-card p-5">
                  <dt className="font-display text-base font-semibold">{it.name}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{it.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ))}

      <section className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-14">
          <h2 className="font-display text-2xl font-bold tracking-tight">Start with 50 pupils, free.</h2>
          <Button asChild size="lg" className="gap-2">
            <Link href="/signup">Create your school <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>
    </>
  )
}
