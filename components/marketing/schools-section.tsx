import { MessageSquare, School, Quote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { REFERENCE_SCHOOLS } from '@/lib/schools'
import { DEMO_WHATSAPP_HREF } from '@/lib/site'
import type { Locale } from '@/components/marketing/landing-copy'

const T = {
  en: {
    kicker: 'Schools using Shule SMS',
    title: 'Run by real school offices.',
    lead: 'Schools that have agreed to be named. Ask any of them what changed in their office.',
    pupils: 'pupils',
    since: 'since',
    emptyKicker: 'Founding schools',
    emptyTitle: 'Be one of the first ten schools.',
    emptyBody: 'Shule SMS is new. The first ten schools to come on board get their data imported and their office trained on site by us, a fixed price for the first two years, and a direct line to the people who build it. In return we ask to name you here once you are happy.',
    emptyCta: 'Ask about the founding offer',
  },
  sw: {
    kicker: 'Shule zinazotumia Shule SMS',
    title: 'Inaendeshwa na ofisi za shule za kweli.',
    lead: 'Shule zilizokubali kutajwa. Waulize yeyote kati yao kilichobadilika ofisini kwao.',
    pupils: 'wanafunzi',
    since: 'tangu',
    emptyKicker: 'Shule waanzilishi',
    emptyTitle: 'Kuwa mojawapo ya shule kumi za kwanza.',
    emptyBody: 'Shule SMS ni mpya. Shule kumi za kwanza kujiunga zinapata data yao kuhamishwa na ofisi yao kufundishwa shuleni na sisi, bei isiyobadilika kwa miaka miwili ya kwanza, na mawasiliano ya moja kwa moja na wanaoijenga. Tunachoomba ni kukutaja hapa ukishafurahi.',
    emptyCta: 'Uliza kuhusu ofa ya waanzilishi',
  },
} as const

const initials = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('')

export function SchoolsSection({ locale }: { locale: Locale }) {
  const t = T[locale]
  const schools = REFERENCE_SCHOOLS
  if (schools.length === 0) {
    return (
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-8 rounded-2xl border border-secondary/40 bg-secondary/5 p-8 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">{t.emptyKicker}</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">{t.emptyTitle}</h2>
              <p className="mt-3 text-muted-foreground">{t.emptyBody}</p>
            </div>
            <div className="md:justify-self-end">
              <Button asChild size="lg" className="gap-2"><a href={DEMO_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer"><MessageSquare className="h-4 w-4" /> {t.emptyCta}</a></Button>
            </div>
          </div>
        </div>
      </section>
    )
  }
  const quoted = schools.filter((s) => s.quote)
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t.kicker}</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">{t.title}</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t.lead}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {schools.map((s) => (
            <li key={s.name} className="flex items-center gap-3 rounded-xl border border-border bg-background p-4">
              {s.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logo} alt="" className="h-11 w-11 shrink-0 rounded-lg object-contain" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/12 font-display text-sm font-bold text-primary">{initials(s.name) || <School className="h-5 w-5" />}</span>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.place} · {s.levels}{s.pupils ? ` · ~${s.pupils.toLocaleString('en-GB')} ${t.pupils}` : ''}{s.since ? ` · ${t.since} ${s.since}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
        {quoted.length > 0 && (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {quoted.slice(0, 4).map((s) => (
              <figure key={s.name} className="rounded-2xl border border-border bg-background p-6">
                <Quote className="h-5 w-5 text-secondary" />
                <blockquote className="mt-3 font-display text-lg leading-snug">“{s.quote}”</blockquote>
                <figcaption className="mt-3 text-sm text-muted-foreground">{s.person ? `${s.person}, ` : ''}{s.name}, {s.place}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
