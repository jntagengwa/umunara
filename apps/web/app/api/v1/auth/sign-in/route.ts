import { signInSchema } from '@umunara/schemas'
import { jsonResponse, readJson } from '../../../http'
import { createSessionService } from '../service'

export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const input = signInSchema.parse(await readJson(request))
    return (await createSessionService()).signIn(input)
  })
}
