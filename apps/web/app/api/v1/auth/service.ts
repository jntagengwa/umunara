import { SessionService } from '@umunara/api'
import { AuthRepository } from '@umunara/database/repositories'
import { createServerClient } from '@umunara/database/server'

export async function createSessionService(): Promise<SessionService> {
  return new SessionService(new AuthRepository(await createServerClient()))
}
