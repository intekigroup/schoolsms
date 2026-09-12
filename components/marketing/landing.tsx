import Link from 'next/link'
import { ArrowRight, MessageSquare, PlayCircle, CalendarRange, Wallet, ShieldCheck, Database, Lock, Clock, GraduationCap, BookOpenCheck, Users, Landmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReportCardVignette, ReceiptVignette, SmsVignette } from '@/components/marketing/vignettes'
import { COPY, type Locale } from '@/components/marketing/landing-copy'
import { DEMO_WHATSAPP_HREF } from '@/lib/site'
import { SchoolsSection } from '@/components/marketing/schools-section'

/**
 * The landing page, in either language. Real product output (report card,
 * class sheet, payslip, ID card) is shown as images rendered from PDFs the
 * demo school produced — `public/marketing/*.jpg`.
 */
const DOC_IMAGES = [
  { src: '/marketing/report-card.jpg', ratio: 'aspect-[1/1.414]' },
  { src: '/marketing/class-sheet.jpg', ratio: 'aspect-[1.414/1]' },
  { src: '/marketing/payslip.jpg', ratio: 'aspect-[1/1.414]' },
  { src: '/marketing/id-card.jpg', ratio: 'aspect-[1.586/1]' },
]
const GROUP_ICONS = [GraduationCap, BookOpenCheck, Users, Landmark]
const MADE_ICONS = [CalendarRange, Wallet, MessageSquare]
const TRUST_ICONS = [ShieldCheck, Lock, Database, Clock]

export function Landing({ locale }: { locale: Locale }) {
  const c = COPY[locale]
  const href = (p: string) => (locale === 'sw' && p === '/' ? '/sw' : p)
  return (
    <>
      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="hero-gradient">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" />{c.kicker}
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-[3.5rem]">
              {c.h1a}<br />{c.h1b}
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">{c.lead}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <a href={DEMO_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer"><MessageSquare className="h-4 w-4" /> {c.ctaDemo}</a>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link href="/demo"><PlayCircle className="h-4 w-4" /> {c.ctaTry}</Link>
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              <Link href="/signup" className="font-medium text-primary hover:underline">{c.ctaStart} →</Link>
            </p>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-border pt-6">
              {c.stats.map(([n, l]) => (
                <div key={l}>
                  <dt className="font-display text-2xl font-bold tabular-nums">{n}</dt>
                  <dd className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          {/* The product, not a stock photo. Stacked on wide screens; a plain column below lg so nothing overlaps. */}
          <div className="relative mx-auto w-full max-w-md space-y-4 lg:max-w-none lg:space-y-0">
            <ReportCardVignette className="relative z-10" />
            <ReceiptVignette className="relative z-20 max-w-sm lg:-mt-6 lg:ml-16" />
            <SmsVignette className="relative z-30 max-w-sm lg:-mt-4 lg:mr-20" />
          </div>
        </div>
      </section>

      {/* ── Made for here ───────────────────────────────────── */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{c.madeForHere.kicker}</p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold tracking-tight">{c.madeForHere.title}</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {c.madeForHere.items.map((f, i) => { const I = MADE_ICONS[i]; return (
              <div key={f.title} className="flex gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary"><I className="h-5 w-5" /></span>
                <div><h3 className="font-display text-lg font-semibold">{f.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p></div>
              </div>
            ) })}
          </div>
        </div>
      </section>

      <SchoolsSection locale={locale} />

      {/* ── Modules, grouped ────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{c.modules.kicker}</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">{c.modules.title}</h2>
          </div>
          <Button asChild variant="ghost" className="gap-1.5"><Link href="/features">{c.modules.more} <ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {c.modules.groups.map((g, gi) => { const I = GROUP_ICONS[gi]; return (
            <div key={g.title} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary"><I className="h-4 w-4" /></span><h3 className="font-display text-lg font-semibold">{g.title}</h3></div>
              <ul className="mt-4 space-y-3">
                {g.items.map((m) => (
                  <li key={m.name}><p className="text-sm font-semibold">{m.name}</p><p className="text-xs text-muted-foreground">{m.note}</p></li>
                ))}
              </ul>
            </div>
          ) })}
        </div>
      </section>

      {/* ── Real documents ──────────────────────────────────── */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{c.documents.kicker}</p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold tracking-tight">{c.documents.title}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{c.documents.lead}</p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {c.documents.items.map((d, i) => (
              <figure key={d.title} className="flex flex-col rounded-2xl border border-border bg-card p-3 shadow-sm">
                <div className={`overflow-hidden rounded-lg border border-border bg-white ${DOC_IMAGES[i].ratio}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={DOC_IMAGES[i].src} alt={d.title} loading="lazy" className="h-full w-full object-cover object-top" />
                </div>
                <figcaption className="mt-3"><p className="font-display font-semibold">{d.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.body}</p></figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Steps ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{c.steps.kicker}</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">{c.steps.title}</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {c.steps.items.map(([title, body], i) => (
            <li key={title} className="relative rounded-2xl border border-border bg-card p-6">
              <span className="font-display text-sm font-bold text-primary">{locale === 'sw' ? 'Hatua' : 'Step'} {i + 1}</span>
              <h3 className="mt-2 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Trust ───────────────────────────────────────────── */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{c.trust.kicker}</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">{c.trust.title}</h2>
              <p className="mt-4 text-muted-foreground">{c.trust.lead}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {c.trust.items.map(([title, body], i) => { const I = TRUST_ICONS[i]; return (
                <li key={title} className="rounded-xl border border-border bg-background p-4"><I className="h-5 w-5 text-secondary" /><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p></li>
              ) })}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ──────────────────────────────────── */}
      <section className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 px-5 py-16">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{c.pricing.kicker}</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">{c.pricing.title}</h2>
          <p className="mt-3 text-muted-foreground">{c.pricing.body}</p>
          <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">{c.pricing.hint}</p>
        </div>
        <Button asChild size="lg" className="gap-2"><Link href="/pricing">{c.pricing.cta} <ArrowRight className="h-4 w-4" /></Link></Button>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{c.faq.kicker}</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">{c.faq.title}</h2>
          <dl className="mt-8 grid gap-4 md:grid-cols-2">
            {c.faq.items.map(([q, a]) => (
              <div key={q} className="rounded-2xl border border-border bg-card p-5">
                <dt className="font-display font-semibold">{q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-8 md:flex md:items-center md:justify-between md:gap-8">
            <div className="max-w-xl">
              <h2 className="font-display text-2xl font-bold tracking-tight">{c.finalCta.title}</h2>
              <p className="mt-2 text-muted-foreground">{c.finalCta.body}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 md:mt-0">
              <Button asChild size="lg" className="gap-2"><a href={DEMO_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer"><MessageSquare className="h-4 w-4" /> {c.finalCta.whatsapp}</a></Button>
              <Button asChild size="lg" variant="outline" className="gap-2"><Link href={href('/demo')}><PlayCircle className="h-4 w-4" /> {c.finalCta.demo}</Link></Button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
