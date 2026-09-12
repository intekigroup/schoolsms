'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle, ArrowRight, X, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Onboarding } from '@/lib/onboarding'

/** "Get your school running" — shown on the admin dashboard until every step is done or the office hides it. */
export function OnboardingChecklist({ initial, schoolName }: { initial: Onboarding; schoolName: string }) {
  const [ob, setOb] = useState(initial)
  if (ob.dismissed || ob.complete) return null
  const hide = async () => { const r = await fetch('/api/onboarding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dismissed: true }) }); if (r.ok) setOb(await r.json()) }
  const nextStep = ob.steps.find((s) => !s.done)
  const pct = Math.round((ob.done / ob.total) * 100)
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><Rocket className="h-3.5 w-3.5" /> Getting {schoolName} running</p>
            <p className="mt-1 text-sm text-muted-foreground">{ob.done} of {ob.total} steps done. {nextStep ? <>Next: <Link href={nextStep.href} className="font-medium text-foreground hover:underline">{nextStep.title}</Link>.</> : null}</p>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={hide}><X className="h-4 w-4" /> Hide</Button>
        </div>
        <div className="mt-3 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ob.steps.map((s) => (
            <li key={s.key}>
              <Link href={s.href} className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-card', s.done ? 'border-transparent opacity-70' : 'border-border bg-card')}>
                {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-secondary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0"><span className={cn('block font-medium', s.done && 'line-through')}>{s.title}</span>{!s.done && <span className="block text-xs text-muted-foreground">{s.body}</span>}</span>
                {!s.done && <ArrowRight className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
