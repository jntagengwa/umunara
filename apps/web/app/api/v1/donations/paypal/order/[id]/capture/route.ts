import { ApiError, routeCache } from '@umunara/api'
import { createPayPalDonationService } from '@umunara/api/donations/paypal-context'
import { payPalOrderIdSchema } from '@umunara/schemas'
import { z } from 'zod'
import { requireDonationRateLimit } from '../../../../../../../../lib/donation-request'
import { jsonResponse, readJson } from '../../../../../../http'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return jsonResponse(async () => {
    z.object({})
      .strict()
      .parse(await readJson(request))
    const id = payPalOrderIdSchema.parse((await context.params).id)
    const token = request.headers
      .get('cookie')
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('umunara_paypal_capture='))
      ?.slice('umunara_paypal_capture='.length)
    if (!token) throw new ApiError(403, 'PayPal approval expired. Please start again.')
    await requireDonationRateLimit(request)
    return createPayPalDonationService(routeCache).capturePayPalOrder(id, token)
  })
}
