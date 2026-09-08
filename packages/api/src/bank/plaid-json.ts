import 'server-only'

function decimalIdentity(value: string): string {
  const parts = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value)
  if (!parts || value.length > 128) throw new Error('Invalid provider amount.')
  const digits = `${parts[2]}${parts[3] ?? ''}`.replace(/^0+/, '')
  if (!digits) return '0'
  const significant = digits.replace(/0+$/, '')
  const exponent =
    Number(parts[4] ?? 0) - (parts[3]?.length ?? 0) + digits.length - significant.length
  return `${parts[1]}${significant}e${exponent}`
}

/** Node 22's source-aware reviver lets us reject rounding before using a JSON number. */
export function parsePlaidSyncJson(rawBody: string): unknown {
  return JSON.parse(
    rawBody,
    (key: string, value: unknown, context?: { source?: string }): unknown => {
      if (key === 'amount' && typeof value === 'number') {
        if (
          !Number.isFinite(value) ||
          !context?.source ||
          decimalIdentity(context.source) !== decimalIdentity(String(value))
        ) {
          throw new Error('Provider amount lost decimal precision.')
        }
      }
      return value
    }
  )
}
