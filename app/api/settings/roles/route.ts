export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiRole, ROLES } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { record } from '@/lib/audit'
import { CAPABILITIES, CAPABILITY_KEYS, CONFIGURABLE_ROLES, invalidatePermissions, permissionMatrix } from '@/lib/permissions'

/**
 * Settings → Roles & permissions.
 *   GET            the matrix: every capability × configurable role, with default/effective/configurable
 *   PUT { changes: [{ role, capability, allowed }] }   save adjustments (allowed === default removes the row)
 *   DELETE         reset the school to the platform defaults
 */
export async function GET() {
  const guard = await requireApiRole(ROLES.settingsRead)
  if (!guard.ok) return guard.response
  return NextResponse.json({ roles: CONFIGURABLE_ROLES, matrix: await permissionMatrix(guard.schoolId, ROLES) })
}

const Body = z.object({
  changes: z.array(z.object({
    role: z.enum(CONFIGURABLE_ROLES),
    capability: z.string().refine((k) => CAPABILITY_KEYS.has(k), 'Unknown capability'),
    allowed: z.boolean(),
  })).min(1).max(500),
})

export async function PUT(req: Request) {
  const guard = await requireApiRole(ROLES.settingsWrite, req)
  if (!guard.ok) return guard.response
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid changes' }, { status: 400 })
  const { schoolId } = guard
  let applied = 0
  await prisma.$transaction(async (tx) => {
    for (const c of parsed.data.changes) {
      const meta = CAPABILITIES.find((m) => m.key === c.capability)!
      if (!meta.configurable.includes(c.role)) continue // fixed cells are ignored, never errors
      const isDefault = (ROLES[c.capability as keyof typeof ROLES] as readonly string[]).includes(c.role) === c.allowed
      if (isDefault) await tx.rolePermission.deleteMany({ where: { schoolId, role: c.role, capability: c.capability } })
      else await tx.rolePermission.upsert({ where: { schoolId_role_capability: { schoolId, role: c.role, capability: c.capability } }, create: { schoolId, role: c.role, capability: c.capability, allowed: c.allowed }, update: { allowed: c.allowed } })
      applied++
    }
  })
  invalidatePermissions(schoolId)
  await record(guard.session, { action: 'update', entity: 'RolePermission', entityId: null, summary: `Changed ${applied} role permission(s)` })
  return NextResponse.json({ applied, matrix: await permissionMatrix(schoolId, ROLES) })
}

export async function DELETE(req: Request) {
  const guard = await requireApiRole(ROLES.settingsWrite, req)
  if (!guard.ok) return guard.response
  const r = await prisma.rolePermission.deleteMany({ where: { schoolId: guard.schoolId } })
  invalidatePermissions(guard.schoolId)
  await record(guard.session, { action: 'update', entity: 'RolePermission', entityId: null, summary: `Reset role permissions to defaults (${r.count} adjustment(s) removed)` })
  return NextResponse.json({ removed: r.count, matrix: await permissionMatrix(guard.schoolId, ROLES) })
}
