'use client'

import { useMemo, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/i18n-context'
import { TZ_REGIONS, SCHOOL_TYPES, PUPIL_BANDS, REFERRAL_SOURCES, defaultTerms } from '@/lib/tz'
import { GraduationCap, Globe, ArrowLeft, ArrowRight, Check, MailCheck, School, User, CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Three-step school registration: the person, the school, the year. Every
 * field a school office would otherwise be asked for on a phone call, so the
 * account is usable the moment the email is confirmed.
 */
const LEVELS = [
  { value: 'NURSERY', en: 'Nursery', sw: 'Chekechea' },
  { value: 'PRIMARY', en: 'Primary (Std 1–7)', sw: 'Msingi (Darasa 1–7)' },
  { value: 'O_LEVEL', en: 'O-level (Form 1–4)', sw: 'O-level (Kidato 1–4)' },
  { value: 'A_LEVEL', en: 'A-level (Form 5–6)', sw: 'A-level (Kidato 5–6)' },
] as const

const T = {
  en: {
    title: 'Register your school', steps: ['You', 'Your school', 'The year'],
    you: { name: 'Your full name', email: 'Your email (this is your login)', phone: 'Your phone (WhatsApp)', job: 'Your role at the school', jobs: ['Head teacher', 'Owner / director', 'Bursar / accountant', 'Academic master', 'ICT / secretary', 'Other'], password: 'Password', confirm: 'Confirm password', strength: ['Too short', 'Weak', 'Okay', 'Strong'] },
    school: { name: 'School name', short: 'Short name (for SMS sender & receipts)', type: 'Type of school', levels: 'Levels you teach', pupils: 'Approximate number of pupils', region: 'Region', district: 'District / town', address: 'Address (street, ward)', phone: 'School phone', email: 'School email (optional)', motto: 'Motto (printed on report cards, optional)' },
    year: { title: 'Academic year', lead: 'We set up the year and terms now so the first register can be taken today. Dates can be changed later under Settings → Academic.', year: 'Year', term: 'Term', from: 'Starts', to: 'Ends', locale: 'Language for your school', heard: 'How did you hear about Shule SMS?', accept: 'I accept the', terms: 'terms of service', and: 'and', privacy: 'privacy policy', free: 'Free for up to 50 pupils. No card, no expiry.' },
    next: 'Continue', back: 'Back', submit: 'Create the school', creating: 'Creating…', hasAccount: 'Already have an account?', login: 'Log in',
    done: { title: 'Check your inbox', body: (e: string) => `We sent a confirmation link to ${e}. Click it to activate the account, then sign in.`, resend: 'Send the link again', sent: 'Sent.', login: 'Go to login' },
    errors: { mismatch: 'Passwords do not match', levels: 'Choose at least one level', terms: 'Please accept the terms to continue' },
  },
  sw: {
    title: 'Sajili shule yako', steps: ['Wewe', 'Shule yako', 'Mwaka'],
    you: { name: 'Jina lako kamili', email: 'Barua pepe yako (ndiyo ya kuingia)', phone: 'Simu yako (WhatsApp)', job: 'Nafasi yako shuleni', jobs: ['Mkuu wa shule', 'Mmiliki / mkurugenzi', 'Mhasibu', 'Mwalimu wa taaluma', 'TEHAMA / katibu', 'Nyingine'], password: 'Neno siri', confirm: 'Rudia neno siri', strength: ['Fupi mno', 'Dhaifu', 'Sawa', 'Imara'] },
    school: { name: 'Jina la shule', short: 'Jina fupi (kwa SMS na risiti)', type: 'Aina ya shule', levels: 'Ngazi unazofundisha', pupils: 'Idadi ya wanafunzi (takriban)', region: 'Mkoa', district: 'Wilaya / mji', address: 'Anwani (mtaa, kata)', phone: 'Simu ya shule', email: 'Barua pepe ya shule (hiari)', motto: 'Kauli mbiu (inachapishwa kwenye ripoti, hiari)' },
    year: { title: 'Mwaka wa masomo', lead: 'Tunaweka mwaka na mihula sasa ili rejista ya kwanza ichukuliwe leo. Tarehe zinaweza kubadilishwa baadaye chini ya Mipangilio → Taaluma.', year: 'Mwaka', term: 'Muhula', from: 'Unaanza', to: 'Unaisha', locale: 'Lugha ya shule yako', heard: 'Ulisikiaje kuhusu Shule SMS?', accept: 'Nakubali', terms: 'masharti ya huduma', and: 'na', privacy: 'sera ya faragha', free: 'Bure kwa wanafunzi hadi 50. Bila kadi, bila kuisha.' },
    next: 'Endelea', back: 'Rudi', submit: 'Sajili shule', creating: 'Inasajili…', hasAccount: 'Tayari una akaunti?', login: 'Ingia',
    done: { title: 'Angalia barua pepe yako', body: (e: string) => `Tumetuma kiungo cha uthibitisho kwa ${e}. Kibofye ili kuwasha akaunti, kisha uingie.`, resend: 'Tuma kiungo tena', sent: 'Imetumwa.', login: 'Nenda kuingia' },
    errors: { mismatch: 'Maneno siri hayalingani', levels: 'Chagua angalau ngazi moja', terms: 'Tafadhali kubali masharti ili kuendelea' },
  },
} as const

/** Defined at module level so inputs keep focus between keystrokes. */
function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>{children}{hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}</div>
}

function strength(pw: string) { let s = 0; if (pw.length >= 8) s++; if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++; if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++; return pw.length < 8 ? 0 : s }

export function SignupForm() {
  const router = useRouter()
  const { locale, setLocale } = useI18n()
  const L = locale === 'sw' ? 'sw' : 'en'
  const t = T[L]
  const year = new Date().getUTCFullYear()
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<{ email: string; emailConfigured: boolean } | null>(null)
  const [resent, setResent] = useState(false)
  const [f, setF] = useState({
    name: '', email: '', phone: '', jobTitle: '', password: '', confirm: '',
    schoolName: '', shortName: '', schoolType: 'PRIVATE', levels: ['PRIMARY'] as string[], approxPupils: '150', region: '', district: '', address: '', schoolPhone: '', schoolEmail: '', motto: '',
    academicYear: String(year), terms: defaultTerms(year), preferredLocale: L, referralSource: '', acceptTerms: false,
  })
  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }))
  const pwScore = useMemo(() => strength(f.password), [f.password])

  const validate = (s: number) => {
    if (s === 0) {
      if (f.name.trim().length < 2 || !f.email.includes('@') || f.phone.trim().length < 9) return 'fill'
      if (f.password.length < 8) return t.you.strength[0]
      if (f.password !== f.confirm) return t.errors.mismatch
    }
    if (s === 1) {
      if (f.schoolName.trim().length < 2 || !f.region) return 'fill'
      if (f.levels.length === 0) return t.errors.levels
    }
    if (s === 2 && !f.acceptTerms) return t.errors.terms
    return ''
  }
  const next = () => { const e = validate(step); if (e) { setError(e === 'fill' ? (L === 'sw' ? 'Jaza sehemu zote zenye alama' : 'Fill in every marked field') : e); return } setError(''); setStep(step + 1) }

  const submit = async () => {
    const e = validate(2); if (e) { setError(e); return }
    setLoading(true); setError('')
    try {
      const body = { ...f, jobTitle: f.jobTitle || undefined, shortName: f.shortName || undefined, approxPupils: Number(f.approxPupils) || undefined, district: f.district || undefined, address: f.address || undefined, schoolPhone: f.schoolPhone || undefined, schoolEmail: f.schoolEmail || undefined, motto: f.motto || undefined, academicYear: Number(f.academicYear), referralSource: f.referralSource || undefined, confirm: undefined }
      const res = await fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error ?? 'Signup failed'); if (data?.field) setStep(['name', 'email', 'phone', 'password'].includes(data.field) ? 0 : ['terms', 'acceptTerms', 'academicYear'].includes(data.field) ? 2 : 1); return }
      if (data.emailConfigured) { setDone({ email: f.email, emailConfigured: true }); return }
      // No mail server configured (local/dev): the account is usable at once.
      const r = await signIn('credentials', { email: f.email, password: f.password, redirect: false })
      if (r?.error) { setDone({ email: f.email, emailConfigured: false }); return }
      router.replace('/dashboard')
    } catch { setError('Something went wrong') } finally { setLoading(false) }
  }
  const resend = async () => { await fetch('/api/auth/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: done?.email }) }); setResent(true) }

  return (
    <div className="min-h-screen hero-gradient px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><GraduationCap className="h-5 w-5 text-primary" /></span><span className="font-display text-xl font-bold">Shule <span className="text-primary">SMS</span></span></Link>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { const n = L === 'en' ? 'sw' : 'en'; setLocale(n); set('preferredLocale', n) }}><Globe className="h-4 w-4" />{L === 'en' ? 'SW' : 'EN'}</Button>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-lg sm:p-8">
          {done ? (
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary/15 text-secondary"><MailCheck className="h-7 w-7" /></span>
              <h2 className="mt-4 font-display text-2xl font-bold">{t.done.title}</h2>
              <p className="mt-2 text-muted-foreground">{t.done.body(done.email)}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={resend} disabled={resent}>{resent ? t.done.sent : t.done.resend}</Button>
                <Button asChild><Link href={`/login?email=${encodeURIComponent(done.email)}`}>{t.done.login}</Link></Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold">{t.title}</h1>
              <ol className="mt-4 flex items-center gap-2 text-xs">
                {t.steps.map((s, i) => (
                  <li key={s} className="flex items-center gap-2">
                    <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold', i < step ? 'border-secondary bg-secondary text-white' : i === step ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>
                    <span className={cn(i === step ? 'font-semibold' : 'text-muted-foreground')}>{s}</span>
                    {i < t.steps.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
                  </li>
                ))}
              </ol>

              <div className="mt-6 space-y-4">
                {step === 0 && (
                  <>
                    <div className="flex items-center gap-2 text-sm font-medium"><User className="h-4 w-4 text-primary" />{t.steps[0]}</div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t.you.name} required><Input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" /></Field>
                      <Field label={t.you.job}><Select value={f.jobTitle} onValueChange={(v) => set('jobTitle', v)}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{t.you.jobs.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent></Select></Field>
                      <Field label={t.you.email} required><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" /></Field>
                      <Field label={t.you.phone} required hint="0745 389 941"><Input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" /></Field>
                      <Field label={t.you.password} required><Input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
                        {f.password && <div className="mt-1 flex items-center gap-1.5">{[1, 2, 3].map((i) => <span key={i} className={cn('h-1 flex-1 rounded', pwScore >= i ? (pwScore >= 3 ? 'bg-secondary' : pwScore === 2 ? 'bg-amber-500' : 'bg-red-500') : 'bg-muted')} />)}<span className="text-[11px] text-muted-foreground">{t.you.strength[pwScore]}</span></div>}
                      </Field>
                      <Field label={t.you.confirm} required><Input type="password" value={f.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" /></Field>
                    </div>
                  </>
                )}
                {step === 1 && (
                  <>
                    <div className="flex items-center gap-2 text-sm font-medium"><School className="h-4 w-4 text-primary" />{t.steps[1]}</div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t.school.name} required><Input value={f.schoolName} onChange={(e) => set('schoolName', e.target.value)} placeholder="e.g. Kilimanjaro Academy" /></Field>
                      <Field label={t.school.short}><Input value={f.shortName} maxLength={20} onChange={(e) => set('shortName', e.target.value)} placeholder="e.g. KILIACAD" /></Field>
                      <Field label={t.school.type}><Select value={f.schoolType} onValueChange={(v) => set('schoolType', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SCHOOL_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s[L]}</SelectItem>)}</SelectContent></Select></Field>
                      <Field label={t.school.pupils}><Select value={f.approxPupils} onValueChange={(v) => set('approxPupils', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PUPIL_BANDS.map((b) => <SelectItem key={b.value} value={String(b.value)}>{b.label}</SelectItem>)}</SelectContent></Select></Field>
                      <div className="sm:col-span-2"><Field label={t.school.levels} required>
                        <div className="flex flex-wrap gap-2">{LEVELS.map((l) => { const on = f.levels.includes(l.value); return <button key={l.value} type="button" onClick={() => set('levels', on ? f.levels.filter((x) => x !== l.value) : [...f.levels, l.value])} className={cn('rounded-full border px-3 py-1.5 text-sm', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>{l[L]}</button> })}</div>
                      </Field></div>
                      <Field label={t.school.region} required><Select value={f.region} onValueChange={(v) => set('region', v)}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{TZ_REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></Field>
                      <Field label={t.school.district}><Input value={f.district} onChange={(e) => set('district', e.target.value)} placeholder="e.g. Moshi" /></Field>
                      <div className="sm:col-span-2"><Field label={t.school.address}><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
                      <Field label={t.school.phone}><Input type="tel" value={f.schoolPhone} onChange={(e) => set('schoolPhone', e.target.value)} placeholder={f.phone || '0745 …'} /></Field>
                      <Field label={t.school.email}><Input type="email" value={f.schoolEmail} onChange={(e) => set('schoolEmail', e.target.value)} placeholder={f.email} /></Field>
                      <div className="sm:col-span-2"><Field label={t.school.motto}><Input value={f.motto} maxLength={120} onChange={(e) => set('motto', e.target.value)} /></Field></div>
                    </div>
                  </>
                )}
                {step === 2 && (
                  <>
                    <div className="flex items-center gap-2 text-sm font-medium"><CalendarRange className="h-4 w-4 text-primary" />{t.year.title}</div>
                    <p className="text-sm text-muted-foreground">{t.year.lead}</p>
                    <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
                      <Field label={t.year.year}><Input type="number" min={2020} max={2100} value={f.academicYear} onChange={(e) => { const y = Number(e.target.value); set('academicYear', e.target.value); if (y >= 2020 && y <= 2100) set('terms', defaultTerms(y)) }} /></Field>
                      <div className="space-y-2">
                        {f.terms.map((tm, i) => (
                          <div key={i} className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                            <Input value={tm.name} onChange={(e) => set('terms', f.terms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                            <Input type="date" value={tm.startDate} onChange={(e) => set('terms', f.terms.map((x, j) => (j === i ? { ...x, startDate: e.target.value } : x)))} />
                            <Input type="date" value={tm.endDate} onChange={(e) => set('terms', f.terms.map((x, j) => (j === i ? { ...x, endDate: e.target.value } : x)))} />
                          </div>
                        ))}
                        <p className="text-[11px] text-muted-foreground">{t.year.term} · {t.year.from} · {t.year.to}</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t.year.locale}><Select value={f.preferredLocale} onValueChange={(v) => set('preferredLocale', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="sw">Kiswahili</SelectItem></SelectContent></Select></Field>
                      <Field label={t.year.heard}><Select value={f.referralSource} onValueChange={(v) => set('referralSource', v)}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{REFERRAL_SOURCES.map((r) => <SelectItem key={r.value} value={r.value}>{r[L]}</SelectItem>)}</SelectContent></Select></Field>
                    </div>
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} /><span>{t.year.accept} <Link href="/terms" target="_blank" className="text-primary underline">{t.year.terms}</Link> {t.year.and} <Link href="/privacy" target="_blank" className="text-primary underline">{t.year.privacy}</Link>.</span></label>
                    <p className="rounded-lg bg-secondary/10 p-3 text-sm text-secondary-foreground">{t.year.free}</p>
                  </>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex items-center justify-between pt-2">
                  {step > 0 ? <Button variant="ghost" onClick={() => { setError(''); setStep(step - 1) }} className="gap-1"><ArrowLeft className="h-4 w-4" /> {t.back}</Button> : <span />}
                  {step < 2 ? <Button onClick={next} className="gap-1">{t.next} <ArrowRight className="h-4 w-4" /></Button> : <Button onClick={submit} disabled={loading} className="gap-1">{loading ? t.creating : t.submit} <Check className="h-4 w-4" /></Button>}
                </div>
              </div>
              <p className="mt-6 text-center text-sm text-muted-foreground">{t.hasAccount} <Link href="/login" className="font-medium text-primary hover:underline">{t.login}</Link></p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
