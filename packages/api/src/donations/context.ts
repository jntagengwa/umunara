import 'server-only'
import StripeClient from 'stripe'
import { createAdminClient } from '@umunara/database/admin'
import { DonationRepository } from '@umunara/database/repositories'
import type { CacheInvalidator } from '../cache/invalidation'
import { ApiError } from '../errors'
import { DonationService } from './donation-service'
import { StripeAdapter, stripeApiVersion } from './stripe-adapter'

export function createDonationService(cache: CacheInvalidator): DonationService {
  const key = process.env.STRIPE_RESTRICTED_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const origin = process.env.DONATION_APPLICATION_ORIGIN
  if (
    !key ||
    !/^rk_(test|live)_\S+$/.test(key) ||
    !webhookSecret?.startsWith('whsec_') ||
    !origin
  ) {
    throw new ApiError(503, 'Donations are temporarily unavailable. Please try again later.')
  }
  try {
    const stripe = new StripeClient(key, {
      apiVersion: stripeApiVersion,
      maxNetworkRetries: 2,
      timeout: 10_000,
      httpClient: StripeClient.createFetchHttpClient((input, init) => fetch(input, init)),
    })
    return new DonationService(
      new StripeAdapter(stripe, webhookSecret, origin, key.startsWith('rk_live_')),
      new DonationRepository(createAdminClient()),
      cache
    )
  } catch {
    throw new ApiError(503, 'Donations are temporarily unavailable. Please try again later.')
  }
}
