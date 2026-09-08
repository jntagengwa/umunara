import { expect, it, vi } from 'vitest'
import { parsePlaidSyncJson } from './plaid-json'
vi.mock('server-only', () => ({}))

it.each(['15.25', '1234567890.12', '99999999999.99', '12.3400', '1e3', '0', '-0', '-15.25'])(
  'preserves normal and large exact decimal amounts: %s',
  (raw) => {
    expect(parsePlaidSyncJson(`{"amount":${raw}}`)).toEqual({ amount: Number(raw) })
  }
)
it.each(['90071992547409.91', '1.00000000000000001', '1e-999', '1e999'])(
  'rejects precision loss, overflow and underflow: %s',
  (raw) => {
    expect(() => parsePlaidSyncJson(`{"amount":${raw}}`)).toThrow()
  }
)
