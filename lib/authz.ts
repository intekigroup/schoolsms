import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import type { Session } from 'next-auth'
import type { UserRole } from '@prisma/client'
import { auth } from '@/auth'
import { isStandalone } from '@/lib/edition'
import { overridesFor, roleHolds } from '@/lib/permissions'

/**
 * Role-based authorization for API routes and dashboard pages.
 *
 * Every API route already scopes its queries by `schoolId` (tenant isolation).
 * These helpers add the missing second axis: what a role is allowed to DO
 * inside its own tenant. SUPER_ADMIN passes every check.
 */

/**
 * Whether the caller's role holds the capability. SUPER_ADMIN is a platform
 * role: it manages schools and billing through requireSuperAdmin and is
 * deliberately NOT allowed into any school's own pages or data.
 */
async function isAllowed(role: UserRole | undefined, allowed: readonly UserRole[], schoolId: string | null | undefined) {
  if (!role || role === 'SUPER_ADMIN') return false
  const key = (allowed as CapabilityRoles).key
  if (key && schoolId) return roleHolds(role, key, allowed, await overridesFor(schoolId))
  return allowed.includes(role)
}

/**
 * A school keeps working only while its subscription is ACTIVE. Anything else —
 * SUSPENDED, EXPIRED, CANCELLED — puts the tenant in read-only: they can still
 * see their records (locking a school out of its own attendance register helps
 * nobody), but cannot create, change or delete until billing is settled.
 *
 * A tenant the platform has switched off entirely (School.isActive = false)
 * never gets a session at all; that is enforced in auth.ts.
 */
export function tenantReadOnly(session: Session): boolean {
  // A standalone school owns its server; there is no subscription to lapse.
  if (isStandalone()) return false
  if (session.user.role === 'SUPER_ADMIN') return false
  const status = session.user.subscriptionStatus
  // No subscription row at all is treated as unrestricted, matching plan limits.
  if (!status) return false
  return status !== 'ACTIVE'
}

/** The message a blocked write should carry. */
export function readOnlyMessage(session: Session): string {
  const status = (session.user.subscriptionStatus ?? '').toLowerCase()
  return `This school's subscription is ${status || 'inactive'}, so records cannot be changed. ` +
    'Existing records are still readable. Contact the platform administrator to restore access.'
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export type Guard =
  | { ok: true; session: Session; role: UserRole; schoolId: string }
  | { ok: false; response: NextResponse }

/**
 * API guard. Returns the session plus a non-null `schoolId` when the caller is
 * authenticated, holds one of `allowed`, and belongs to a school.
 *
 *   const guard = await requireApiRole(['SCHOOL_ADMIN', 'TEACHER'], req)
 *   if (!guard.ok) return guard.response
 *   const { schoolId } = guard
 *
 * Pass `req` on mutating handlers so an unpaid tenant is held to read-only.
 */
export async function requireApiRole(allowed: readonly UserRole[], req?: Request): Promise<Guard> {
  const session = await auth()
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const role = session.user.role
  const schoolId = session.user.schoolId
  if (!(await isAllowed(role, allowed, schoolId))) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (!schoolId) {
    return { ok: false, response: NextResponse.json({ error: 'No school' }, { status: 400 }) }
  }
  if (req && MUTATING.has(req.method) && tenantReadOnly(session)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: readOnlyMessage(session), readOnly: true, subscriptionStatus: session.user.subscriptionStatus },
        { status: 402 }
      ),
    }
  }
  return { ok: true, session, role, schoolId }
}

/**
 * Like `requireApiRole` but for routes that operate on the user themselves
 * rather than on school-scoped records (e.g. notifications), so no school is
 * required and any signed-in role is accepted.
 */
export async function requireApiUser(): Promise<
  { ok: true; session: Session; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true, session, userId: session.user.id }
}

/** Platform-level guard: SUPER_ADMIN only, and no school scoping. */
export async function requireSuperAdmin(): Promise<
  { ok: true; session: Session } | { ok: false; response: NextResponse }
> {
  const session = await auth()
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session }
}

/**
 * Page guard for server components. Redirects instead of returning a response:
 * unauthenticated users to /login, authorised-but-wrong-role users to
 * /dashboard (or /dashboard/parents, which is the only page a PARENT can see).
 */
export async function requirePageRole(allowed: readonly UserRole[]): Promise<Session> {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'SUPER_ADMIN') redirect('/dashboard/super-admin')
  if (!(await isAllowed(session.user.role, allowed, session.user.schoolId))) {
    redirect(session.user.role === 'PARENT' ? '/dashboard/parents' : '/dashboard')
  }
  return session
}

/** Capabilities the signed-in user effectively holds in their school — drives the sidebar. */
export async function capabilitiesFor(session: Session): Promise<string[]> {
  const role = session.user.role, schoolId = session.user.schoolId
  if (!role || role === 'SUPER_ADMIN' || !schoolId) return []
  const overrides = await overridesFor(schoolId)
  return Object.entries(ROLES).filter(([key, roles]) => roleHolds(role, key, roles, overrides)).map(([key]) => key)
}

/** A role list that knows its own capability key, so guards can look up per-school overrides. */
export type CapabilityRoles = readonly UserRole[] & { readonly key?: string }
function tag<T extends Record<string, readonly UserRole[]>>(map: T): { [K in keyof T]: T[K] & { readonly key: K } } {
  for (const [key, roles] of Object.entries(map)) Object.defineProperty(roles, 'key', { value: key, enumerable: false })
  return map as any
}

/** Role sets, kept next to each other so the API and the sidebar can't drift. */
export const ROLES = tag({
  studentsRead: ['SCHOOL_ADMIN', 'TEACHER'],
  /** Creating, editing and provisioning pupils is office work; teachers read their classes. */
  studentsWrite: ['SCHOOL_ADMIN'],
  studentsDelete: ['SCHOOL_ADMIN'],
  staff: ['SCHOOL_ADMIN'],
  classesRead: ['SCHOOL_ADMIN', 'TEACHER'],
  classesWrite: ['SCHOOL_ADMIN'],
  academicsRead: ['SCHOOL_ADMIN', 'TEACHER'],
  academicsWrite: ['SCHOOL_ADMIN'],
  timetableRead: ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
  timetableWrite: ['SCHOOL_ADMIN'],
  attendance: ['SCHOOL_ADMIN', 'TEACHER'],
  exams: ['SCHOOL_ADMIN', 'TEACHER'],
  fees: ['SCHOOL_ADMIN', 'ACCOUNTANT'],
  library: ['SCHOOL_ADMIN', 'LIBRARIAN'],
  hostel: ['SCHOOL_ADMIN'],
  transport: ['SCHOOL_ADMIN'],
  events: ['SCHOOL_ADMIN', 'TEACHER'],
  announcements: ['SCHOOL_ADMIN'],
  reports: ['SCHOOL_ADMIN', 'ACCOUNTANT'],
  settingsRead: ['SCHOOL_ADMIN', 'ACCOUNTANT'],
  settingsWrite: ['SCHOOL_ADMIN'],
  /** ID cards are issued by the office. */
  idCards: ['SCHOOL_ADMIN'],
  /** HR: employment records, leave approval, staff attendance, payroll. */
  hr: ['SCHOOL_ADMIN'],
  /** Any staff member's own HR record: leave requests and payslips. */
  hrSelf: ['SCHOOL_ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN'],
  /** Ledger, expenses, budgets and financial statements. */
  accounting: ['SCHOOL_ADMIN', 'ACCOUNTANT'],
  /** Homework and lesson notes are posted by teachers (and the office). */
  homework: ['SCHOOL_ADMIN', 'TEACHER'],
  /** Teacher ↔ guardian messages. */
  messaging: ['SCHOOL_ADMIN', 'TEACHER', 'PARENT'],
  /** Own children for a PARENT; the guardian contact directory for staff who need it. */
  parents: ['PARENT', 'SCHOOL_ADMIN', 'TEACHER'],
  /** A student's own record. */
  ownRecord: ['STUDENT'],
  dashboard: ['SCHOOL_ADMIN', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN'],
} as const satisfies Record<string, readonly UserRole[]>)
