import 'server-only'
import { createAdminClient } from '@umunara/database/admin'
import { DonationRepository } from '@umunara/database/repositories'
import type { CacheInvalidator } from '../cache/invalidation'
import { ApiError } from '../errors'
import { DonationService } from './donation-service'
import { PayPalAdapter } from './paypal-adapter'

export function createPayPalDonationService(cache: CacheInvalidator): DonationService {
  const {
    PAYPAL_CLIENT_ID: clientId,
    PAYPAL_CLIENT_SECRET: clientSecret,
    PAYPAL_WEBHOOK_ID: webhookId,
    PAYPAL_ENVIRONMENT: environment,
    DONATION_APPLICATION_ORIGIN: applicationOrigin,
  } = process.env
  if (
    !clientId ||
    !clientSecret ||
    !webhookId ||
    !applicationOrigin ||
    !['sandbox', 'live'].includes(environment ?? '')
  )
    throw new ApiError(503, 'PayPal giving is temporarily unavailable.')
  try {
    const ledger = new DonationRepository(createAdminClient())
    return new DonationService(
      null,
      ledger,
      cache,
      new PayPalAdapter(
        {
          clientId,
          clientSecret,
          webhookId,
          environment: environment === 'live' ? 'live' : 'sandbox',
          applicationOrigin,
          monthlyPlanId: process.env.PAYPAL_MONTHLY_PLAN_ID,
          yearlyPlanId: process.env.PAYPAL_YEARLY_PLAN_ID,
        },
        ledger
      )
    )
  } catch {
    throw new ApiError(503, 'PayPal giving is temporarily unavailable.')
  }
}
