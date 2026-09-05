import { z } from 'zod'

export const roleSchema = z.enum(['pending', 'member', 'editor', 'admin'])

export type Role = z.infer<typeof roleSchema>

const roleRanks: Record<Role, number> = {
  pending: 0,
  member: 1,
  editor: 2,
  admin: 3,
}

export function requireRole(role: Role, minimumRole: Role): void {
  if (roleRanks[role] < roleRanks[minimumRole]) {
    throw new Error(`The ${minimumRole} role is required.`)
  }
}
