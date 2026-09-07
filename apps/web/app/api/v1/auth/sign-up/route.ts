import { signUpSchema } from '@umunara/schemas'
import { jsonResponse, readJson } from '../../../http'
import { createSessionService } from '../service'
import { requireAuthRateLimit } from '../../../../../lib/auth-rate-limit'

export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const input = signUpSchema.parse(await readJson(request))
    await requireAuthRateLimit(request, 'sign-up')
    return (await createSessionService()).signUp(
      input,
      new URL('/api/v1/auth/confirm', request.url).href,
    )
  }, 201)
}
