import type { Metadata } from 'next'
import { PageBanner } from '@/components/marketing/page-banner'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'About — Shule SMS',
  description: 'Why Shule SMS exists: school management built for Tanzanian private schools, in shillings, in Kiswahili and English, on the phones people actually have.',
}

export default function AboutPage() {
  return (
    <>
      <PageBanner
        eyebrow="About"
        accent="yellow"
        title="Software for the school office, not the software company."
        description="Built from what a Tanzanian private school actually does in a term — the register, the marks, the fees, the SMS, the report card."
      />

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6 text-lg leading-relaxed text-foreground/90">
            <p>
              Most school systems sold in Tanzania were built somewhere else and translated at the last
              minute. The fee screen expects dollars and cents. The calendar expects semesters. The parent
              portal assumes every parent checks email. The office ends up keeping the real records in an
              exercise book and typing them in later — or not at all.
            </p>
            <p>
              Shule SMS starts from the other end: what does a private school in Tanzania actually do in a
              term? It takes a register every morning. It sets a mid-term and an end-of-term exam and grades
              them A to F. It collects fees in shillings, often over M-Pesa, and hands out a receipt. It
              texts parents about the meeting on Saturday. At the end of the term it prints a report card
              with a space for the head teacher to sign.
            </p>
            <p>
              Every one of those is a first-class part of the system, not an add-on. The interface is in
              English and Kiswahili. It works on the phone a bursar already has. And because a school's
              marks and money are not test data, every change is attributed to the person who made it,
              every school's records are kept apart from every other's, and a school can be backed up on
              its own.
            </p>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-base font-semibold">What we mean by "built for here"</h2>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                <li>Academic years split into terms, with one marked current.</li>
                <li>Classes from nursery and Standard 1 through Form 6.</li>
                <li>Money in whole Tanzanian shillings; no rounding, ever.</li>
                <li>M-Pesa, Tigo Pesa and Airtel Money as payment methods, not "other".</li>
                <li>Phone numbers normalised the Tanzanian way: 0712… and +255 712… are the same parent.</li>
                <li>Dates the way Tanzania writes them, in East Africa Time.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-base font-semibold">Honest about the edges</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                SMS goes through your own NextSMS account, so the messaging cost is yours and visible.
                If your subscription lapses, the school goes read-only rather than dark — your registers
                and receipts stay readable while you sort it out.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-14">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">See it with your own school's numbers.</h2>
            <p className="mt-1 text-muted-foreground">Free for 50 pupils, no card, no expiry.</p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="outline" size="lg"><Link href="/contact">Ask a question</Link></Button>
            <Button asChild size="lg" className="gap-2">
              <Link href="/signup">Start free <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
