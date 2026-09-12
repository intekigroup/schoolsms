import type { Metadata } from 'next'
import { PageBanner } from '@/components/marketing/page-banner'
import Link from 'next/link'
import { ArrowRight, Check, Users, Layers, Phone, MessageSquare, Cloud, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PLAN_LIMITS, PAYMENT_TERMS_DAYS } from '@/lib/billing'
import { CONTACT_PHONE_DISPLAY, CONTACT_TEL_HREF, CONTACT_WHATSAPP_HREF } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Pricing — Shule SMS',
  description:
    'Two editions: a hosted subscription quoted from your pupil numbers and levels, or a standalone install on your own server. Both quoted per school, in Tanzanian shillings.',
}

/**
 * There is no price list. Both editions are quoted per school from pupil
 * numbers and level. This page explains the two editions, the factors, what
 * every school gets, and sends people to ask. Capacity bands for the hosted
 * edition come from the same table enforcement reads.
 */
const EDITIONS = [
  {
    key: 'cloud',
    icon: Cloud,
    name: 'Cloud',
    kicker: 'Hosted by us · monthly subscription',
    who: 'For a school that wants nothing to install or maintain.',
    points: [
      'We host, back up and update it',
      'Sign in from any phone or computer',
      `Free for up to ${PLAN_LIMITS.FREE.maxStudents} pupils`,
      'Subscription quoted from pupils and levels',
      `Monthly invoice in TZS, due in ${PAYMENT_TERMS_DAYS} days`,
      'Bank transfer or mobile money',
    ],
    cta: { href: '/contact?topic=quote', label: 'Ask for a quote' },
  },
  {
    key: 'standalone',
    icon: Server,
    name: 'Standalone',
    kicker: 'Installed on your own server · one school',
    who: 'For a school that keeps its records on its own premises.',
    points: [
      'Runs on a server or computer you control',
      'Your data never leaves the school',
      'No subscription, no monthly gating',
      'Same seventeen modules, same portals',
      'Quoted from pupils and levels',
      'Installation and handover included',
    ],
    cta: { href: '/contact?topic=standalone', label: 'Ask about standalone' },
  },
] as const

const BANDS = [
  { key: 'FREE', name: 'Free', who: 'A small school, or trying everything first.' },
  { key: 'BASIC', name: 'Basic', who: 'A primary school or a single-stream secondary.' },
  { key: 'PREMIUM', name: 'Premium', who: 'A full nursery-to-Form 6 school.' },
  { key: 'ENTERPRISE', name: 'Enterprise', who: 'Multi-campus groups and very large schools.' },
] as const

const INCLUDED = [
  'All seventeen modules',
  'Report cards and fee statements as PDF',
  'Parent and student portals',
  'SMS to parents through your own NextSMS account',
  'Audit trail, isolation, backups',
  'English and Kiswahili',
]

const fmt = (n: number) => n.toLocaleString('en-GB')

export default function PricingPage() {
  return (
    <>
      <PageBanner
        eyebrow="Pricing"
        accent="green"
        title="Two editions. Both priced for your school."
        description="Hosted in the cloud on a subscription, or installed on your own server. Either way the price is quoted from how many pupils you have and which levels you teach — never from a list."
      >
        <Button asChild size="lg" className="gap-2">
          <Link href="/contact?topic=quote">Ask for a quote <ArrowRight className="h-4 w-4" /></Link>
        </Button>
        <a href={CONTACT_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-md border border-white/25 bg-white/5 px-5 text-sm font-medium text-white hover:bg-white/10">
          <MessageSquare className="h-4 w-4" /> WhatsApp {CONTACT_PHONE_DISPLAY}
        </a>
      </PageBanner>

      {/* ── The two editions ───────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Editions</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold tracking-tight">Same system. Choose where it lives.</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {EDITIONS.map((e) => (
            <div key={e.key} className="flex flex-col rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <e.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold">{e.name}</h3>
                  <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{e.kicker}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{e.who}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {e.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 font-display text-lg font-semibold">Quoted per school</p>
              <div className="mt-auto pt-5">
                <Button asChild className="w-full gap-2" variant={e.key === 'cloud' ? 'default' : 'outline'}>
                  <Link href={e.cta.href}>{e.cta.label} <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── What the quote is based on ─────────────────────── */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">How a quote is worked out</p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold tracking-tight">Two things decide the price, for either edition.</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-6">
              <Users className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-display text-xl font-semibold">How many pupils</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The number on your roll. A school of 180 and a school of 1,200 do not pay the same,
                and the quote says exactly which band you sit in.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <Layers className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-display text-xl font-semibold">Which levels you teach</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Nursery, primary (Standard 1–7), O-level (Form 1–4), A-level (Form 5–6). A primary-only
                school runs a simpler year than one teaching all four, and is priced that way.
              </p>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-sm text-muted-foreground">
            Tell us those two things and you will have a written quote within one working day. There are
            no per-user charges and nothing is charged per report card, receipt or SMS from us.
          </p>
        </div>
      </section>

      {/* ── Cloud bands (capacity, not price) ─────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Cloud capacity bands</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">Every school gets everything. Bands set the room.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BANDS.map((b) => {
            const limits = PLAN_LIMITS[b.key]
            const unlimited = b.key === 'ENTERPRISE'
            return (
              <div key={b.key} className={`rounded-2xl border bg-card p-5 ${b.key === 'FREE' ? 'border-secondary/50' : 'border-border'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold">{b.name}</h3>
                  {b.key === 'FREE' && (
                    <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">No charge</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{b.who}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Pupils</dt>
                    <dd className="font-semibold tabular-nums">{unlimited ? 'Unlimited' : `Up to ${fmt(limits.maxStudents)}`}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Staff</dt>
                    <dd className="font-semibold tabular-nums">{unlimited ? 'Unlimited' : `Up to ${fmt(limits.maxStaff)}`}</dd>
                  </div>
                </dl>
                <p className="mt-4 font-display text-base font-semibold">{b.key === 'FREE' ? 'Free' : 'Quoted per school'}</p>
              </div>
            )
          })}
        </div>
        <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((line) => (
            <li key={line} className="flex gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Ask ─────────────────────────────────────────────── */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-8 rounded-2xl border border-primary/40 bg-primary/5 p-8 md:grid-cols-[1.3fr_1fr] md:items-center">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">Get a quote for your school.</h2>
              <p className="mt-2 text-muted-foreground">
                Send the number of pupils, the levels you teach, and whether you want it hosted or on your
                own server. A person replies with a written quote, in Kiswahili or English.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link href="/contact?topic=quote">Request a quote <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="gap-2">
                  <a href={CONTACT_TEL_HREF}><Phone className="h-4 w-4" /> {CONTACT_PHONE_DISPLAY}</a>
                </Button>
              </div>
            </div>
            <div className="grid gap-4 text-sm">
              {[
                ['Cloud billing', `Monthly invoice, due in ${PAYMENT_TERMS_DAYS} days. Pay by bank transfer, M-Pesa, Tigo Pesa or Airtel Money.`],
                ['If a cloud payment is missed', 'The school goes read-only — every register, mark and receipt stays visible — until the invoice is settled. Settling it turns writing back on the same minute.'],
                ['Standalone', 'No subscription and no gating. You own the server; we install, hand over, and are a call away.'],
              ].map(([q, a]) => (
                <div key={q}>
                  <h3 className="font-display text-sm font-semibold">{q}</h3>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{a}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            SMS messages are sent through your own NextSMS account and charged by NextSMS per segment; Shule SMS
            shows the segment count before you send.
          </p>
        </div>
      </section>
    </>
  )
}
