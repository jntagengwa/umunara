import 'server-only'
import { z } from 'zod'
import { payPalCheckoutSchema, payPalOrderIdSchema, type PayPalCheckout } from '@umunara/schemas'

export const providerId = payPalOrderIdSchema
export const providerTime = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString())
export const money = z.object({
  currency_code: z.literal('USD'),
  value: z.string().regex(/^\d+(\.\d{1,2})?$/),
})
export const links = z.array(z.object({ rel: z.string(), href: z.string().url() })).default([])
export const webhook = z.object({
  id: z.string().min(1).max(255),
  event_type: z.string(),
  create_time: providerTime,
  resource: z.unknown(),
})
export type PayPalWebhook = z.infer<typeof webhook>

export function minorUnits(input: unknown): number {
  const { value } = money.parse(input)
  const [whole, fraction = ''] = value.split('.')
  return z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .parse(Number(whole) * 100 + Number(fraction.padEnd(2, '0')))
}

export function readIntent(customId: unknown): PayPalCheckout | null {
  if (typeof customId !== 'string' || !customId.startsWith('umunara:v1:')) return null
  const parts = customId.split(':')
  if (parts.length !== 6) throw new Error('Invalid donation intent.')
  z.string().uuid().parse(parts[2])
  z.string()
    .regex(/^[1-9]\d*$/)
    .parse(parts[3])
  return payPalCheckoutSchema.parse({
    amountMinor: Number(parts[3]),
    currency: parts[4],
    cadence: parts[5],
  })
}

export function relatedId(input: unknown, environment: 'sandbox' | 'live', path: string): string {
  const candidates = links.parse(input).filter((link) => link.rel === 'up')
  if (candidates.length !== 1) throw new Error('Missing or ambiguous original payment.')
  const url = new URL(candidates[0].href)
  const allowedHosts =
    environment === 'live'
      ? ['api-m.paypal.com', 'api.paypal.com']
      : ['api-m.sandbox.paypal.com', 'api.sandbox.paypal.com']
  if (
    url.protocol !== 'https:' ||
    !allowedHosts.includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(path)
  )
    throw new Error('Invalid original payment.')
  return providerId.parse(url.pathname.slice(path.length))
}
