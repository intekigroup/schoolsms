'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { RotateCcw, Save, Lock } from 'lucide-react'

/**
 * Settings → Roles & permissions: a matrix of what each role may do in this
 * school. The head teacher (SCHOOL_ADMIN) always has everything; the other
 * roles start from the platform defaults and can be adjusted cell by cell.
 */
type Cell = { default: boolean; allowed: boolean; configurable: boolean }
type Row = { key: string; group: string; label: string; description: string; roles: Record<string, Cell> }
const ROLE_LABELS: Record<string, string> = { TEACHER: 'Teacher', ACCOUNTANT: 'Accountant', LIBRARIAN: 'Librarian', PARENT: 'Parent', STUDENT: 'Pupil' }

export function RolesSettings({ canEdit }: { canEdit: boolean }) {
  const [roles, setRoles] = useState<string[]>([])
  const [matrix, setMatrix] = useState<Row[]>([])
  const [pending, setPending] = useState<Record<string, boolean>>({}) // `${role}:${cap}` → allowed
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = (d: any) => { setRoles(d.roles ?? []); setMatrix(d.matrix ?? []); setPending({}) }
  useEffect(() => { fetch('/api/settings/roles').then((r) => r.json()).then(load).catch(() => {}).finally(() => setLoading(false)) }, [])

  const groups = useMemo(() => { const g = new Map<string, Row[]>(); for (const r of matrix) g.set(r.group, [...(g.get(r.group) ?? []), r]); return [...g] }, [matrix])
  const value = (row: Row, role: string) => pending[`${role}:${row.key}`] ?? row.roles[role]?.allowed
  const toggle = (row: Row, role: string) => { if (!canEdit || !row.roles[role]?.configurable) return; const k = `${role}:${row.key}`; const next = !value(row, role); setPending((p) => (next === row.roles[role].allowed ? (({ [k]: _, ...rest }) => rest)(p) : { ...p, [k]: next })) }
  const changes = Object.entries(pending).map(([k, allowed]) => { const [role, capability] = k.split(':'); return { role, capability, allowed } })

  const save = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/settings/roles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error ?? 'Could not save'); return }
      load(d); toast.success(`${d.applied} permission(s) updated — staff see the change on their next page load`)
    } finally { setBusy(false) }
  }
  const reset = async () => {
    setBusy(true)
    try { const r = await fetch('/api/settings/roles', { method: 'DELETE' }); const d = await r.json().catch(() => ({})); if (r.ok) { load(d); toast.success('Back to the platform defaults') } } finally { setBusy(false) }
  }
  const adjusted = matrix.reduce((n, row) => n + roles.filter((r) => row.roles[r] && row.roles[r].allowed !== row.roles[r].default).length, 0)

  if (loading) return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading…</CardContent></Card>
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Roles &amp; permissions</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Tick what each role may do in this school. The head teacher / school admin always has everything. Teachers are still limited to their own classes wherever that applies.</p>
          {adjusted > 0 && <p className="mt-1 text-xs text-primary">{adjusted} cell(s) differ from the platform defaults.</p>}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={reset} disabled={busy || adjusted === 0}><RotateCcw className="h-3.5 w-3.5" /> Reset to defaults</Button>
            <Button size="sm" className="gap-1.5" onClick={save} disabled={busy || changes.length === 0}><Save className="h-3.5 w-3.5" /> Save {changes.length ? `(${changes.length})` : ''}</Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Capability</th>
                <th className="px-2 py-2 text-center font-medium">School admin</th>
                {roles.map((r) => <th key={r} className="px-2 py-2 text-center font-medium">{ROLE_LABELS[r] ?? r}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, rows]) => (
                <GroupRows key={group} group={group} rows={rows} roles={roles} value={value} toggle={toggle} canEdit={canEdit} pending={pending} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground"><Lock className="mr-1 inline h-3 w-3" />Greyed cells are fixed: they follow from what the role is (a pupil always sees their own record; a parent cannot take a register).</p>
      </CardContent>
    </Card>
  )
}

function GroupRows({ group, rows, roles, value, toggle, canEdit, pending }: { group: string; rows: Row[]; roles: string[]; value: (r: Row, role: string) => boolean; toggle: (r: Row, role: string) => void; canEdit: boolean; pending: Record<string, boolean> }) {
  return (
    <>
      <tr className="bg-muted/40"><td colSpan={roles.length + 2} className="px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</td></tr>
      {rows.map((row) => (
        <tr key={row.key} className="border-b border-border/60">
          <td className="py-2 pr-3"><div className="font-medium">{row.label}</div><div className="text-xs text-muted-foreground">{row.description}</div></td>
          <td className="px-2 py-2 text-center"><span className="inline-block h-4 w-4 rounded border border-primary bg-primary/80" title="Always" /></td>
          {roles.map((role) => {
            const cell = row.roles[role]; const on = value(row, role); const changed = `${role}:${row.key}` in pending
            return (
              <td key={role} className="px-2 py-2 text-center">
                <button type="button" disabled={!canEdit || !cell?.configurable} onClick={() => toggle(row, role)} aria-pressed={on} title={cell?.configurable ? (on ? 'Allowed — click to revoke' : 'Not allowed — click to grant') : 'Fixed for this role'}
                  className={cn('inline-flex h-6 w-6 items-center justify-center rounded border transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card', !cell?.configurable && 'opacity-30 cursor-not-allowed', changed && 'ring-2 ring-amber-400')}>
                  {on ? '✓' : ''}
                </button>
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
