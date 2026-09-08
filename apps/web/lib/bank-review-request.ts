import 'server-only'
import { ApiError } from '@umunara/api'
import { bankTransactionQuerySchema, type BankTransactionQuery } from '@umunara/schemas'

export function readBankFilters(request: Request): BankTransactionQuery {
  const parameters = new URL(request.url).searchParams
  const values: Record<string, string | number> = {}
  const numeric = ['page', 'pageSize', 'minAmountMinor', 'maxAmountMinor']
  for (const [key, value] of parameters) {
    if (key in values || (numeric.includes(key) && !/^-?\d+$/.test(value)))
      throw new ApiError(400, 'Invalid bank filters.')
    values[key] = numeric.includes(key) ? Number(value) : value
  }
  return bankTransactionQuerySchema.parse(values)
}
