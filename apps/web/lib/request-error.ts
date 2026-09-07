import { z } from 'zod'

export async function responseError(response: Response): Promise<string> {
  const result = z.object({ error: z.string() }).safeParse(await response.json().catch(() => null))
  return result.success ? result.data.error : 'Unable to complete the request. Please try again.'
}
