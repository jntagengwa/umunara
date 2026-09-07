import { requireRequestRateLimit } from './request-rate-limit'

export async function requireDonationRateLimit(request: Request): Promise<void> {
  await requireRequestRateLimit(request, {
    rule: 'umunara-donation-checkout',
    enabled: process.env.DONATION_RATE_LIMIT_ENABLED === '1',
    unavailableMessage: 'Donations are temporarily unavailable. Please try again later.',
  })
}
