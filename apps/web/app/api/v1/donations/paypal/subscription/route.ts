import { routeCache } from '@umunara/api'
import { createPayPalDonationService } from '@umunara/api/donations/paypal-context'
import { payPalCheckoutSchema } from '@umunara/schemas'
import { requireDonationRateLimit } from '../../../../../../lib/donation-request'
import { jsonResponse, readJson } from '../../../../http'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const input = payPalCheckoutSchema.parse(await readJson(request))
    await requireDonationRateLimit(request)
    return createPayPalDonationService(routeCache).createPayPalSubscription(input)
  }, 201)
}
