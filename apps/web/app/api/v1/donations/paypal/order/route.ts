import { routeCache } from '@umunara/api'
import { createPayPalDonationService } from '@umunara/api/donations/paypal-context'
import { payPalCheckoutSchema } from '@umunara/schemas'
import { requireDonationRateLimit } from '../../../../../../lib/donation-request'
import { jsonResponse, readJson } from '../../../../http'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  let captureCookie: string | undefined
  const response = await jsonResponse(async () => {
    const input = payPalCheckoutSchema.parse(await readJson(request))
    await requireDonationRateLimit(request)
    const { captureToken, ...approval } =
      await createPayPalDonationService(routeCache).createPayPalOrder(input)
    captureCookie = `umunara_paypal_capture=${captureToken}; HttpOnly; SameSite=Lax; Path=/api/v1/donations/paypal/order; Max-Age=900${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
    return approval
  }, 201)
  if (captureCookie) response.headers.set('Set-Cookie', captureCookie)
  return response
}
