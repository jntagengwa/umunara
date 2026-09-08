import type { BankTransactionClassification } from '@umunara/schemas'

export const classificationLabels: Record<BankTransactionClassification, string> = {
  unreviewed: 'Unreviewed',
  donation: 'Donation',
  non_donation: 'Non-donation',
  processor_payout: 'Processor payout',
}

export function bankAmount(amountMinor: number, currency: string): string {
  const digits =
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  const value = BigInt(amountMinor)
  const magnitude = value < 0n ? -value : value
  const factor = 10n ** BigInt(digits)
  return `${currency} ${value < 0n ? '-' : ''}${magnitude / factor}${digits ? `.${(magnitude % factor).toString().padStart(digits, '0')}` : ''}`
}
