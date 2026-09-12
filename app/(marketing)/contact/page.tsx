import type { Metadata } from 'next'
import { PageBanner } from '@/components/marketing/page-banner'
import { MessageSquare, Clock, MapPin, Phone } from 'lucide-react'
import { CONTACT_PHONE_DISPLAY, CONTACT_TEL_HREF, CONTACT_WHATSAPP_HREF } from '@/lib/site'
import { ContactForm } from './contact-form'

export const metadata: Metadata = {
  title: 'Contact — Shule SMS',
  description: 'Ask about Shule SMS, request a demo for your school, or talk to us about an Enterprise plan.',
}

// Next 16: searchParams is a Promise.
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const raw = (await searchParams).topic
  const initialTopic = Array.isArray(raw) ? raw[0] : raw
  return (
    <>
      <PageBanner
        eyebrow="Contact"
        accent="blue"
        title={initialTopic === 'quote' ? 'Get a quote for your school.' : initialTopic === 'standalone' ? 'Run it on your own server.' : 'Tell us about your school.'}
        description="A question, a demo, or a conversation about an Enterprise agreement — write to us and a person will reply. Kiswahili or English, whichever you prefer."
      />

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1.3fr_1fr]">
        <ContactForm initialTopic={initialTopic} />

        <aside className="space-y-4 lg:pt-2">
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
            <Phone className="h-5 w-5 text-primary" />
            <h2 className="mt-2 font-display text-base font-semibold">Call or WhatsApp</h2>
            <a href={CONTACT_TEL_HREF} className="mt-1 block font-display text-xl font-bold tabular-nums hover:underline">
              {CONTACT_PHONE_DISPLAY}
            </a>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={CONTACT_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/90">
                <MessageSquare className="h-4 w-4" /> WhatsApp us
              </a>
              <a href={CONTACT_TEL_HREF}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">
                <Phone className="h-4 w-4" /> Call
              </a>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Kiswahili or English. Monday to Friday, East Africa Time.</p>
          </div>
          {[
            [MessageSquare, 'What to include', 'Your school\'s name, roughly how many pupils, and what you use today — even if it is an exercise book. It helps us answer properly the first time.'],
            [Clock, 'When to expect a reply', 'Within one working day, Monday to Friday, East Africa Time.'],
            [MapPin, 'Where we are', 'Tanzania. Prices in shillings, support in Kiswahili and English.'],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof MessageSquare
            return (
              <div key={title as string} className="rounded-2xl border border-border bg-card p-5">
                <I className="h-5 w-5 text-primary" />
                <h2 className="mt-2 font-display text-base font-semibold">{title as string}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body as string}</p>
              </div>
            )
          })}
        </aside>
      </section>
    </>
  )
}
