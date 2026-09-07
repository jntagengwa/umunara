import type { Role } from './roles'

export interface ProfileDto {
  id: string
  role: Role
  approvedAt: string | null
  fullName: string | null
  email: string | null
}

export interface EventRegistrationDto {
  id: string
  eventId: string
  profileId: string
  status: 'registered' | 'cancelled'
  registeredAt: string
}

export interface ResourceSummaryDto {
  id: string
  title: string
  description: string | null
}
