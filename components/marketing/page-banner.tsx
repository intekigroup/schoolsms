import type { ReactNode } from 'react'

type Accent = 'blue' | 'green' | 'yellow'

/**
 * Full-width banner heading for inner marketing pages.
 *
 * Deliberately a dark band in both themes — the one place the site commits to a
 * single look — with a drawn Kilimanjaro skyline and the flag's diagonal as
 * texture. Each page picks one of the three Tanzanian accents so the pages read
 * as one family while staying tellable apart.
 */
const ACCENTS: Record<Accent, { glow: string; text: string; stripe: string }> = {
  blue: { glow: 'hsl(195 100% 45%)', text: 'text-[hsl(195_100%_70%)]', stripe: 'hsl(195 100% 45% / 0.25)' },
  green: { glow: 'hsl(133 71% 42%)', text: 'text-[hsl(133_71%_65%)]', stripe: 'hsl(133 71% 42% / 0.25)' },
  yellow: { glow: 'hsl(49 97% 50%)', text: 'text-[hsl(49_97%_60%)]', stripe: 'hsl(49 97% 50% / 0.22)' },
}

export function PageBanner({
  eyebrow,
  title,
  description,
  accent = 'blue',
  children,
}: {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  accent?: Accent
  children?: ReactNode
}) {
  const a = ACCENTS[accent]
  return (
    <section
      className="relative isolate overflow-hidden border-b border-white/10 text-white"
      style={{ background: 'hsl(210 25% 8%)' }}
    >
      {/* Accent glow behind the copy */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-40 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{ background: a.glow, opacity: 0.22 }}
      />
      {/* Flag-diagonal stripes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(135deg, ${a.stripe} 0 2px, transparent 2px 28px)`,
          maskImage: 'linear-gradient(to left, black 20%, transparent 70%)',
          WebkitMaskImage: 'linear-gradient(to left, black 20%, transparent 70%)',
        }}
      />
      {/* Kilimanjaro skyline */}
      <svg
        aria-hidden
        viewBox="0 0 1200 240"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-[0.28]"
      >
        <defs>
          <linearGradient id={`peak-${accent}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.9" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* far ridge */}
        <path d="M0 200 L140 150 L260 175 L380 120 L470 160 L560 140 L700 175 L820 130 L960 170 L1080 145 L1200 180 L1200 240 L0 240 Z" fill="white" fillOpacity="0.12" />
        {/* Kibo, the main peak, with its snow cap */}
        <path d="M480 240 L600 70 L720 240 Z" fill="white" fillOpacity="0.16" />
        <path d="M566 118 L600 70 L634 118 L620 112 L606 122 L594 112 L580 122 Z" fill={`url(#peak-${accent})`} />
        {/* Mawenzi, the jagged second peak */}
        <path d="M760 240 L820 150 L840 170 L860 140 L890 180 L930 240 Z" fill="white" fillOpacity="0.14" />
        <path d="M0 240 L1200 240" stroke="white" strokeOpacity="0.15" />
      </svg>

      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 sm:pt-20">
        <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${a.text}`}>{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
          {title}
        </h1>
        {description && <p className="mt-5 max-w-xl text-lg text-white/70">{description}</p>}
        {children && <div className="mt-7 flex flex-wrap items-center gap-3">{children}</div>}
      </div>
    </section>
  )
}
