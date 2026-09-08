import 'server-only'
import { roleSchema, type Role } from '@umunara/schemas'
import { ApiError } from '../errors'

export interface Actor {
  id: string
  role: Role
  approvedAt: string | null
}

export interface AuthSource {
  getUser(): Promise<{ id: string; emailConfirmedAt: string | null } | null>
  getProfile(id: string): Promise<{ id: string; role: unknown; approvedAt: string | null } | null>
}

export async function optionalUser(source: AuthSource): Promise<Actor | null> {
  const user = await source.getUser()
  if (!user) return null
  if (!user.emailConfirmedAt) throw new ApiError(403, 'Email verification is required.')
  const profile = await source.getProfile(user.id)
  const role = roleSchema.safeParse(profile?.role)
  if (
    !profile ||
    profile.id !== user.id ||
    !role.success ||
    (role.data !== 'pending' && !profile.approvedAt) ||
    (role.data === 'pending' && profile.approvedAt)
  ) {
    throw new ApiError(403, 'An eligible profile is required.')
  }
  return { id: user.id, role: role.data, approvedAt: profile.approvedAt }
}

export async function requireUser(source: AuthSource): Promise<Actor> {
  const actor = await optionalUser(source)
  if (!actor) throw new ApiError(401, 'Sign in is required.')
  return actor
}
