import type { UserRole } from '@prisma/client'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
  schoolId: string | null
  locale: string
  image?: string | null
  /** Capability keys the user effectively holds in their school (see lib/permissions.ts). */
  caps?: string[]
}

export interface DashboardStat {
  label: string
  value: number | string
  change?: number
  icon: string
  color: string
}
