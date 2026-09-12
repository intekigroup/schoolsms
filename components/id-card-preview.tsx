'use client'

import type { IdCardConfig } from '@/lib/id-cards/settings'

/**
 * On-screen replica of the printed card so a design change can be seen before
 * anything is downloaded. Proportions follow CR80 (85.6 × 54 mm); the PDF is
 * the source of truth, this mirrors its layout.
 */
export interface PreviewHolder {
  kind: 'student' | 'staff'
  name: string
  subtitle: string | null
  photoUrl: string | null
  fields: [string, string][]
  emergency?: string | null
}

export interface PreviewSchool {
  name: string
  motto?: string | null
  city?: string | null
  region?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  logoUrl?: string | null
}

export function IdCardPreview({ config, school, holder, side = 'front', scale = 1.6 }: {
  config: IdCardConfig; school: PreviewSchool; holder: PreviewHolder; side?: 'front' | 'back'; scale?: number
}) {
  const landscape = config.orientation === 'landscape'
  const w = (landscape ? 85.6 : 54) * 3.78 * scale
  const h = (landscape ? 54 : 85.6) * 3.78 * scale
  const kindCfg = holder.kind === 'student' ? config.student : config.staff
  const f = (n: number) => `${n * scale}px`
  const initials = holder.name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
  const sub = config.showMotto && school.motto ? school.motto : [school.city, school.region].filter(Boolean).join(', ')

  if (side === 'back') {
    const returnTo = config.back.returnTo || [school.address, [school.city, school.region].filter(Boolean).join(', '), school.phone].filter(Boolean).join(' · ')
    return (
      <div style={{ width: w, height: h, fontSize: f(7.5) }} className="relative overflow-hidden rounded-lg border bg-white text-black shadow-md">
        <div style={{ height: f(8), background: config.theme.accent }} />
        <div style={{ height: f(3), background: config.theme.secondary }} />
        <div style={{ padding: f(12) }} className="space-y-2">
          <p style={{ color: config.theme.accent, fontSize: f(9) }} className="font-bold uppercase">{school.name}</p>
          {config.back.note && <p style={{ fontSize: f(7) }} className="leading-snug">{config.back.note}</p>}
          {holder.kind === 'student' && config.back.showEmergencyContact && (
            <div><p style={{ fontSize: f(6) }} className="font-bold uppercase text-neutral-500">Emergency contact</p><p>{holder.emergency ?? 'Not recorded'}</p></div>
          )}
          {returnTo && <div><p style={{ fontSize: f(6) }} className="font-bold uppercase text-neutral-500">If found, please return to</p><p>{returnTo}</p></div>}
        </div>
        {config.back.showSignature && (
          <div style={{ right: f(12), bottom: f(18), width: f(90), fontSize: f(6) }} className="absolute border-t border-neutral-400 pt-0.5 text-neutral-500">{config.back.signatureLabel || 'Authorised signature'}</div>
        )}
        <p style={{ left: f(12), bottom: f(6), fontSize: f(6) }} className="absolute text-neutral-500">{[school.phone, school.email].filter(Boolean).join('  ·  ')}</p>
      </div>
    )
  }

  const photoW = (landscape ? 58 : 70) * scale, photoH = (landscape ? 70 : 84) * scale
  return (
    <div style={{ width: w, height: h }} className="relative overflow-hidden rounded-lg border bg-white text-black shadow-md">
      <div style={{ height: f(landscape ? 30 : 40), background: config.theme.accent, color: config.theme.onAccent, padding: `0 ${f(8)}` }} className="flex items-center gap-2">
        {config.showLogo && school.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={school.logoUrl} alt="" style={{ height: f(landscape ? 20 : 28) }} className="object-contain" />
        )}
        <div className="min-w-0">
          <p style={{ fontSize: f(9) }} className="truncate font-bold uppercase leading-tight">{school.name}</p>
          {sub && <p style={{ fontSize: f(5.5), opacity: 0.9 }} className="truncate">{sub}</p>}
        </div>
      </div>
      <div style={{ height: f(2.5), background: config.theme.secondary }} />
      <div style={{ padding: `${f(10)} ${f(10)}` }} className={landscape ? 'flex gap-3' : 'flex flex-col items-center'}>
        <div className="flex shrink-0 flex-col items-center">
          <div style={{ width: photoW, height: photoH, borderColor: config.theme.secondary, borderWidth: 1.5 * scale }} className="flex items-center justify-center overflow-hidden bg-slate-100">
            {holder.photoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={holder.photoUrl} alt="" className="h-full w-full object-cover" />
              : <span style={{ fontSize: f(22) }} className="font-bold text-neutral-400">{initials}</span>}
          </div>
          <span style={{ background: config.theme.accent, color: config.theme.onAccent, fontSize: f(6), padding: `${f(1.5)} ${f(5)}`, marginTop: f(2) }} className="rounded-sm font-bold">{kindCfg.title}</span>
        </div>
        <div className={`min-w-0 flex-1 ${landscape ? '' : 'w-full pt-2'}`}>
          <p style={{ fontSize: f(11) }} className="truncate font-bold leading-tight">{holder.name}</p>
          {holder.subtitle && <p style={{ fontSize: f(8), color: config.theme.accent }} className="truncate">{holder.subtitle}</p>}
          <div style={{ marginTop: f(4) }} className="space-y-1">
            {holder.fields.map(([k, v]) => (
              <div key={k}>
                <p style={{ fontSize: f(5) }} className="font-bold uppercase text-neutral-500">{k}</p>
                <p style={{ fontSize: f(7.5) }} className="truncate">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {config.qr.enabled && (
        <div style={{ right: f(8), bottom: f(8), width: f(36), height: f(36) }} className="absolute grid grid-cols-5 gap-px bg-white p-[2px]">
          {Array.from({ length: 25 }).map((_, i) => <span key={i} className={(i * 7) % 3 === 0 || i < 3 || i % 5 === 0 ? 'bg-black' : 'bg-white'} />)}
        </div>
      )}
      {kindCfg.validUntil && <p style={{ left: f(10), bottom: f(6), fontSize: f(5.5) }} className="absolute text-neutral-500">Valid until {kindCfg.validUntil}</p>}
    </div>
  )
}
