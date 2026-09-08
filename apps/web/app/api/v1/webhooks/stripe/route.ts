import { ApiError, routeCache } from '@umunara/api'
import { createDonationService } from '@umunara/api/donations/context'
import { jsonResponse } from '../../../http'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const signature = request.headers.get('stripe-signature')
    if (!signature) throw new ApiError(400, 'Invalid Stripe webhook.')
    const rawBody = await request.text()
    await createDonationService(routeCache).handleStripeEvent(rawBody, signature)
    return { received: true }
  })
}
