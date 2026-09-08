import { routeCache } from '@umunara/api'
import { createDonationService } from '@umunara/api/donations/context'
import { stripeCheckoutSchema } from '@umunara/schemas'
import { requireRequestRateLimit } from '../../../../../../lib/request-rate-limit'
import { jsonResponse, readJson } from '../../../../http'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const input = stripeCheckoutSchema.parse(await readJson(request))
    await requireRequestRateLimit(request, {
      rule: 'umunara-donation-checkout',
      enabled: process.env.DONATION_RATE_LIMIT_ENABLED === '1',
      unavailableMessage: 'Donations are temporarily unavailable. Please try again later.',
    })
    return createDonationService(routeCache).createStripeCheckout(input)
  }, 201)
}
