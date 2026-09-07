import { routeCache } from '@umunara/api'
import { createPayPalDonationService } from '@umunara/api/donations/paypal-context'
import { jsonResponse } from '../../../http'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const rawBody = await request.text()
    await createPayPalDonationService(routeCache).handlePayPalEvent(rawBody, request.headers)
    return { received: true }
  })
}
