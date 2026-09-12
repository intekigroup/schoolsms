import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, MessageSquare, Copy, KeyRound } from 'lucide-react'
import { PageBanner } from '@/components/marketing/page-banner'
import { Button } from '@/components/ui/button'
import { DEMO_LOGINS, DEMO_WHATSAPP_HREF, CONTACT_PHONE_DISPLAY } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Try the demo school',
  description: 'Sign in to Kilimanjaro Academy, a demo school in Shule SMS, as a teacher, parent, pupil or accountant.',
  robots: { index: true },
}

/**
 * The fastest way to convert a head teacher is to let them click around. The
 * demo school is shared and public, so it exposes the read-mostly roles; the
 * office (admin) walk-through is done live on WhatsApp.
 */
export default function DemoPage() {
  return (
    <>
      <PageBanner eyebrow="Demo school" accent="green" title="Kilimanjaro Academy — try it as a teacher, a parent or a pupil."
        description="A demo school with 100 pupils, ten classes, published results, fees and payroll. Pick a role, sign in, and click anything. It is shared with other visitors and reset regularly, so do not enter real names or numbers.">
        <Button asChild size="lg" className="gap-2"><a href={DEMO_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer"><MessageSquare className="h-4 w-4" /> Book the office walk-through</a></Button>
      </PageBanner>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-4 md:grid-cols-2">
          {DEMO_LOGINS.map((d) => (
            <div key={d.role} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary"><KeyRound className="h-4 w-4" /></span><h2 className="font-display text-xl font-bold">{d.role}</h2></div>
              <p className="mt-2 text-sm text-muted-foreground">{d.note}</p>
              <dl className="mt-4 grid grid-cols-[90px_1fr] gap-y-1 rounded-xl bg-muted/60 p-3 text-sm">
                <dt className="text-muted-foreground">Email</dt><dd className="font-mono">{d.email}</dd>
                <dt className="text-muted-foreground">Password</dt><dd className="font-mono">{d.password}</dd>
              </dl>
              <Button asChild className="mt-4 gap-2"><Link href={`/login?email=${encodeURIComponent(d.email)}`}>Sign in as {d.role.toLowerCase()} <ArrowRight className="h-4 w-4" /></Link></Button>
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-2xl border border-primary/40 bg-primary/5 p-6 md:flex md:items-center md:justify-between md:gap-6">
          <div>
            <h2 className="font-display text-xl font-bold">Want the office view — fees, payroll, accounting, settings?</h2>
            <p className="mt-1 text-sm text-muted-foreground">The admin demo is done live with you in thirty minutes on WhatsApp video, in Kiswahili or English, so nobody can change the demo school under everyone else. Call or message {CONTACT_PHONE_DISPLAY}.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 md:mt-0">
            <Button asChild className="gap-2"><a href={DEMO_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer"><MessageSquare className="h-4 w-4" /> WhatsApp</a></Button>
            <Button asChild variant="outline"><Link href="/contact?topic=demo">Contact form</Link></Button>
          </div>
        </div>
        <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><Copy className="h-3 w-3" /> Tip: the login page pre-fills the email when you use the buttons above.</p>
      </section>
    </>
  )
}
