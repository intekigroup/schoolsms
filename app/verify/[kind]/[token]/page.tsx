import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { verifyCardToken } from '@/lib/id-cards/verify'
import { formatDate } from '@/lib/format'
import { ShieldCheck, ShieldX, ShieldAlert } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Card verification — Shule SMS', robots: { index: false } }

/**
 * Public page opened by the QR code on an ID card. It deliberately shows the
 * minimum a gate guard or a shopkeeper needs — name, school, class or role,
 * and whether the holder is current — and nothing a stranger could misuse.
 */
export default async function VerifyPage({ params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind, token } = await params
  const v = verifyCardToken(kind, decodeURIComponent(token))

  let state: 'valid' | 'inactive' | 'invalid' = 'invalid'
  let holder: { name: string; line: string; school: string; photoUrl: string | null; since: string } | null = null
  if (v.ok) {
    if (v.kind === 'student') {
      const s = await prisma.student.findUnique({ where: { id: v.id }, select: { firstName: true, lastName: true, status: true, photoUrl: true, createdAt: true, class: { select: { name: true } }, school: { select: { name: true } } } })
      if (s) {
        state = s.status === 'ACTIVE' ? 'valid' : 'inactive'
        holder = { name: `${s.firstName} ${s.lastName}`, line: s.class ? `Pupil · ${s.class.name}` : 'Pupil', school: s.school.name, photoUrl: s.photoUrl, since: formatDate(s.createdAt) }
      }
    } else {
      const s = await prisma.staff.findUnique({ where: { id: v.id }, select: { firstName: true, lastName: true, status: true, role: true, photoUrl: true, createdAt: true, school: { select: { name: true } } } })
      if (s) {
        state = s.status === 'ACTIVE' ? 'valid' : 'inactive'
        holder = { name: `${s.firstName} ${s.lastName}`, line: `Staff · ${s.role}`, school: s.school.name, photoUrl: s.photoUrl, since: formatDate(s.createdAt) }
      }
    }
  }

  const tone = state === 'valid'
    ? { Icon: ShieldCheck, bg: 'bg-emerald-600', label: 'Valid card', text: 'This card was issued by the school and the holder is currently enrolled.' }
    : state === 'inactive'
      ? { Icon: ShieldAlert, bg: 'bg-amber-500', label: 'No longer current', text: 'This card was issued by the school, but the holder is no longer active.' }
      : { Icon: ShieldX, bg: 'bg-red-600', label: 'Not recognised', text: 'This code does not match any card issued through Shule SMS.' }

  return (
    <main className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className={`${tone.bg} px-6 py-5 text-white`}>
          <div className="flex items-center gap-3">
            <tone.Icon className="h-8 w-8" />
            <div>
              <p className="text-xs uppercase tracking-[0.14em] opacity-90">Card verification</p>
              <p className="font-display text-xl font-bold">{tone.label}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          {holder ? (
            <div className="flex gap-4">
              <div className="h-24 w-[72px] shrink-0 overflow-hidden rounded-md bg-muted">
                {holder.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={holder.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center font-display text-xl font-bold text-muted-foreground">
                    {holder.name.split(' ').slice(0, 2).map((w) => w[0]).join('')}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-semibold">{holder.name}</p>
                <p className="text-sm text-muted-foreground">{holder.line}</p>
                <p className="mt-2 text-sm">{holder.school}</p>
                <p className="text-xs text-muted-foreground">On record since {holder.since}</p>
              </div>
            </div>
          ) : null}
          <p className="mt-4 text-sm text-muted-foreground">{tone.text}</p>
          <p className="mt-6 text-xs text-muted-foreground">Checked {new Date().toLocaleString('en-GB', { timeZone: process.env.SCHOOL_TIMEZONE || 'Africa/Dar_es_Salaam' })}. Shule SMS.</p>
        </div>
      </div>
    </main>
  )
}
