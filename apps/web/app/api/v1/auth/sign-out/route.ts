import { jsonResponse, requireSameOrigin } from '../../../http'
import { createSessionService } from '../service'

export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    requireSameOrigin(request)
    return (await createSessionService()).signOut()
  })
}
