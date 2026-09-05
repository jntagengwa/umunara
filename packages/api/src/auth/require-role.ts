import 'server-only'
import { requireRole as checkRole, type Role } from '@umunara/schemas'
import type { Actor } from './require-user'
import { ApiError } from '../errors'

export function requireRole(actor: Actor | null, minimumRole: Role): asserts actor is Actor {
  if (!actor) throw new ApiError(401, 'Sign in is required.')
  if (minimumRole !== 'pending' && !actor.approvedAt) {
    throw new ApiError(403, 'Membership approval is required.')
  }
  try {
    checkRole(actor.role, minimumRole)
  } catch {
    throw new ApiError(403, 'You do not have permission for this operation.')
  }
}
