import { expect, it, vi } from 'vitest'
import { relatedId } from './paypal-contracts'

vi.mock('server-only', () => ({}))

it.each([
  ['live', 'api.paypal.com'],
  ['live', 'api-m.paypal.com'],
  ['sandbox', 'api.sandbox.paypal.com'],
  ['sandbox', 'api-m.sandbox.paypal.com'],
] as const)('extracts an original payment ID from the %s host %s', (environment, host) => {
  expect(
    relatedId(
      [{ rel: 'up', href: `https://${host}/v2/payments/captures/CAPTURE123` }],
      environment,
      '/v2/payments/captures/'
    )
  ).toBe('CAPTURE123')
})

it.each([
  'https://api.sandbox.paypal.com/v2/payments/captures/CAPTURE123',
  'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE123',
  'http://api.paypal.com/v2/payments/captures/CAPTURE123',
  'https://api.paypal.com.evil.test/v2/payments/captures/CAPTURE123',
  'https://user:password@api.paypal.com/v2/payments/captures/CAPTURE123',
  'https://api.paypal.com/v2/payments/refunds/REFUND123',
  'https://api.paypal.com/v2/payments/captures/CAPTURE123/refund',
  'https://api.paypal.com/v2/payments/captures/CAPTURE123?other=1',
  'https://api.paypal.com/v2/payments/captures/CAPTURE123#fragment',
  'https://api.paypal.com/v2/payments/captures/%2fCAPTURE123',
])('rejects an unsafe or mismatched live payment link: %s', (href) => {
  expect(() => relatedId([{ rel: 'up', href }], 'live', '/v2/payments/captures/')).toThrow()
})

it('rejects ambiguous original-payment links', () => {
  expect(() =>
    relatedId(
      ['CAPTURE123', 'OTHER123'].map((id) => ({
        rel: 'up',
        href: `https://api.paypal.com/v2/payments/captures/${id}`,
      })),
      'live',
      '/v2/payments/captures/'
    )
  ).toThrow()
})
