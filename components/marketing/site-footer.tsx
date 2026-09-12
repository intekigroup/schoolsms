import Link from 'next/link'
import { GraduationCap, Phone } from 'lucide-react'
import { CONTACT_PHONE_DISPLAY, CONTACT_TEL_HREF, CONTACT_EMAIL, COMPANY_NAME, COMPANY_ADDRESS, COMPANY_REGISTRATION } from '@/lib/site'

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/demo', label: 'Try the demo school' },
      { href: '/signup', label: 'Start free' },
      { href: '/login', label: 'Log in' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/terms', label: 'Terms of service' },
      { href: '/privacy', label: 'Privacy' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="space-y-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Shule SMS home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <GraduationCap className="h-4 w-4" />
            </span>
            <span className="font-display text-base font-bold tracking-tight">
              Shule <span className="text-primary">SMS</span>
            </span>
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">
            Mfumo wa usimamizi wa shule — school management built for Tanzanian private schools,
            from nursery to Form 6.
          </p>
          <a href={CONTACT_TEL_HREF} className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums hover:underline">
            <Phone className="h-3.5 w-3.5 text-primary" /> {CONTACT_PHONE_DISPLAY}
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="block text-sm text-foreground/80 hover:underline">{CONTACT_EMAIL}</a>
          <p className="text-xs text-muted-foreground">
            A product of {COMPANY_NAME}{COMPANY_ADDRESS ? `, ${COMPANY_ADDRESS}` : ''}.{COMPANY_REGISTRATION ? ` ${COMPANY_REGISTRATION}.` : ''} Prices in Tanzanian shillings; pay by bank transfer or mobile money.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {col.title}
            </h3>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-foreground/80 hover:text-foreground hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} {COMPANY_NAME} · Shule SMS · Tanzania 🇹🇿</span>
          <span className="flex gap-3"><Link href="/" className="hover:underline">English</Link><Link href="/sw" className="hover:underline">Kiswahili</Link></span>
        </div>
      </div>
    </footer>
  )
}
