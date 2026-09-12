import type { UserRole } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * Per-school role permissions.
 *
 * `ROLES` in lib/authz.ts holds the platform defaults: which roles may do
 * what. A school can adjust those for its staff roles from Settings → Roles
 * (e.g. let the accountant issue ID cards, or stop teachers seeing the
 * guardian directory). Adjustments live in RolePermission rows and are
 * merged over the defaults here; SCHOOL_ADMIN always keeps everything and
 * SUPER_ADMIN is a platform role that never enters a school's matrix.
 */

/** The roles a school may configure, in the order the matrix shows them. */
export const CONFIGURABLE_ROLES = ['TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'PARENT', 'STUDENT'] as const satisfies readonly UserRole[]
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number]

export interface CapabilityMeta {
  key: string
  group: string
  label: string
  description: string
  /** Roles the school may switch on or off for this capability. Empty = fixed. */
  configurable: readonly UserRole[]
}

const STAFF = ['TEACHER', 'ACCOUNTANT', 'LIBRARIAN'] as const
const EVERYONE = ['TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'PARENT', 'STUDENT'] as const

/** Every capability the guards know, with what the switch means in plain words. */
export const CAPABILITIES: readonly CapabilityMeta[] = [
  { key: 'dashboard', group: 'General', label: 'School dashboard', description: 'The overview page with school-wide counts.', configurable: STAFF },
  { key: 'studentsRead', group: 'Pupils', label: 'View pupils', description: 'The pupil register (teachers see only their own classes).', configurable: STAFF },
  { key: 'studentsWrite', group: 'Pupils', label: 'Enrol and edit pupils', description: 'Add, edit, import and provision pupil logins.', configurable: STAFF },
  { key: 'studentsDelete', group: 'Pupils', label: 'Delete pupils', description: 'Remove a pupil record entirely.', configurable: STAFF },
  { key: 'parents', group: 'Pupils', label: 'Guardian directory', description: 'Phone numbers and details of parents and guardians.', configurable: STAFF },
  { key: 'idCards', group: 'Pupils', label: 'ID cards', description: 'Design and print pupil and staff ID cards.', configurable: STAFF },
  { key: 'staff', group: 'Staff', label: 'Manage staff', description: 'Staff records, teaching loads and staff logins.', configurable: STAFF },
  { key: 'hr', group: 'Staff', label: 'HR and payroll', description: 'Leave approval, staff attendance, contracts and payroll runs.', configurable: STAFF },
  { key: 'classesRead', group: 'Academics', label: 'View classes and seating', description: 'Class lists, class leaders and seating plans.', configurable: STAFF },
  { key: 'classesWrite', group: 'Academics', label: 'Manage classes', description: 'Create classes, assign class teachers and leaders.', configurable: STAFF },
  { key: 'academicsRead', group: 'Academics', label: 'View subjects, years and results', description: 'Subjects, academic years, terms and class results.', configurable: STAFF },
  { key: 'academicsWrite', group: 'Academics', label: 'Manage subjects and years', description: 'Create subjects, academic years and terms.', configurable: STAFF },
  { key: 'timetableRead', group: 'Academics', label: 'View timetable', description: 'Pupils and parents see only their own class.', configurable: EVERYONE },
  { key: 'timetableWrite', group: 'Academics', label: 'Edit timetable', description: 'Place and move lessons.', configurable: STAFF },
  { key: 'attendance', group: 'Academics', label: 'Attendance registers', description: 'Take and view pupil attendance.', configurable: STAFF },
  { key: 'exams', group: 'Academics', label: 'Exams and marks', description: 'Create exams, enter marks and submit for review.', configurable: STAFF },
  { key: 'homework', group: 'Academics', label: 'Homework and lesson notes', description: 'Post homework and notes to classes.', configurable: STAFF },
  { key: 'fees', group: 'Finance', label: 'Fees and receipts', description: 'Fee structures, payments and receipts.', configurable: STAFF },
  { key: 'accounting', group: 'Finance', label: 'Accounting', description: 'Ledger, expenses, budgets and financial statements.', configurable: STAFF },
  { key: 'reports', group: 'Finance', label: 'Reports and exports', description: 'Management reports and CSV exports.', configurable: STAFF },
  { key: 'library', group: 'Services', label: 'Library', description: 'Books, categories and issues.', configurable: STAFF },
  { key: 'hostel', group: 'Services', label: 'Hostel', description: 'Dormitories, rooms and boarders.', configurable: STAFF },
  { key: 'transport', group: 'Services', label: 'Transport', description: 'Routes, vehicles and pupils on each route.', configurable: STAFF },
  { key: 'events', group: 'Communication', label: 'Events calendar', description: 'School events and the calendar.', configurable: EVERYONE },
  { key: 'announcements', group: 'Communication', label: 'Notices and bulk SMS', description: 'Announcements and messaging campaigns to parents.', configurable: STAFF },
  { key: 'messaging', group: 'Communication', label: 'Direct messages', description: 'Teacher ↔ parent conversations.', configurable: EVERYONE },
  { key: 'settingsRead', group: 'Settings', label: 'View settings', description: 'See the school profile and configuration.', configurable: STAFF },
  { key: 'settingsWrite', group: 'Settings', label: 'Change settings', description: 'Edit the profile, grading, ID card, HR and accounting settings.', configurable: STAFF },
  { key: 'hrSelf', group: 'Self-service', label: 'Own HR record', description: 'Leave requests and payslips for oneself.', configurable: [] },
  { key: 'ownRecord', group: 'Self-service', label: 'Own pupil record', description: 'A pupil\'s own marks, attendance and homework.', configurable: [] },
]

export const CAPABILITY_KEYS = new Set(CAPABILITIES.map((c) => c.key))

type Overrides = Map<string, boolean> // `${role}:${capability}` → allowed
const cache = new Map<string, { at: number; overrides: Overrides }>()
// Short: dev bundles keep separate module instances, and a permission change must show up on the next page load.
const TTL_MS = 2_000

/** The school's saved adjustments, cached briefly so guards stay cheap. */
export async function overridesFor(schoolId: string): Promise<Overrides> {
  const hit = cache.get(schoolId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.overrides
  const rows = await prisma.rolePermission.findMany({ where: { schoolId }, select: { role: true, capability: true, allowed: true } })
  const overrides: Overrides = new Map(rows.map((r) => [`${r.role}:${r.capability}`, r.allowed]))
  cache.set(schoolId, { at: Date.now(), overrides })
  return overrides
}

export function invalidatePermissions(schoolId: string) { cache.delete(schoolId) }

/**
 * Whether `role` holds `capability` in this school. Defaults come from the
 * role list the guard was called with; overrides can grant or revoke for the
 * configurable roles only, so SCHOOL_ADMIN cannot be locked out.
 */
export function roleHolds(role: UserRole, capability: string | undefined, defaults: readonly UserRole[], overrides: Overrides): boolean {
  if (role === 'SUPER_ADMIN') return false
  if (role === 'SCHOOL_ADMIN') return defaults.includes('SCHOOL_ADMIN')
  if (capability && (CONFIGURABLE_ROLES as readonly string[]).includes(role)) {
    const meta = CAPABILITIES.find((c) => c.key === capability)
    if (meta?.configurable.includes(role)) {
      const o = overrides.get(`${role}:${capability}`)
      if (o !== undefined) return o
    }
  }
  return defaults.includes(role)
}

/** The full matrix for Settings → Roles: default, effective, and whether each cell can be changed. */
export async function permissionMatrix(schoolId: string, defaults: Record<string, readonly UserRole[]>) {
  const overrides = await overridesFor(schoolId)
  return CAPABILITIES.map((c) => ({
    ...c,
    roles: Object.fromEntries(CONFIGURABLE_ROLES.map((r) => [r, {
      default: (defaults[c.key] ?? []).includes(r),
      allowed: roleHolds(r, c.key, defaults[c.key] ?? [], overrides),
      configurable: c.configurable.includes(r),
    }])),
  }))
}
