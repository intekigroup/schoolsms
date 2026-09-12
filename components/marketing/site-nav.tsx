'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GraduationCap, Menu, X, ArrowRight, MessageSquare } from 'lucide-react'
import { DEMO_WHATSAPP_HREF } from '@/lib/site'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/demo', label: 'Demo' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

/**
 * Marketing navigation. `signedIn` is decided on the server so the primary
 * call to action is right on first paint — no flash of "Start free" for a
 * head teacher who already has an account.
 */
export function SiteNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const sw = pathname === '/sw'
  const lang = (
    <Link href={sw ? '/' : '/sw'} className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground" aria-label={sw ? 'English' : 'Kiswahili'}>
      {sw ? 'EN' : 'SW'}
    </Link>
  )
  const cta = signedIn ? (
    <>
      {lang}
      <Button asChild size="sm" className="gap-1.5">
        <Link href="/dashboard">Open dashboard <ArrowRight className="h-4 w-4" /></Link>
      </Button>
    </>
  ) : (
    <>
      {lang}
      <Button asChild variant="ghost" size="sm">
        <Link href="/login">{sw ? 'Ingia' : 'Log in'}</Link>
      </Button>
      <Button asChild size="sm" className="gap-1.5">
        <a href={DEMO_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer"><MessageSquare className="h-4 w-4" /> {sw ? 'Omba demo' : 'Book a demo'}</a>
      </Button>
    </>
  )

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Shule SMS home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            Shule <span className="text-primary">SMS</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-foreground',
                pathname === l.href ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {cta}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-border/60 bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3" aria-label="Primary mobile">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-3">
              <ThemeToggle />
              {cta}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
