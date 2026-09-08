import type { DonationReportTotals, DonationSummaryDto } from '@umunara/schemas'
import styles from './donation-dashboard.module.css'

const providers = { stripe: 'Stripe', paypal: 'PayPal', manual: 'Manual', bank: 'Bank' }
const cadences = { one_time: 'One time', monthly: 'Monthly', yearly: 'Yearly' }

export function DonationReportResults({ summary }: { summary: DonationSummaryDto }) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: summary.range.currency,
  })
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  const factor = 10n ** BigInt(digits)
  const money = (minor: number): string => {
    const amount = BigInt(minor)
    const whole = amount / factor
    const fraction = (amount < 0n ? -amount : amount) % factor
    // Format whole units as bigint; floating division can lose a cent near the safe limit.
    return formatter
      .formatToParts(whole === 0n && minor < 0 ? -0 : whole)
      .map((part) =>
        part.type === 'fraction' ? fraction.toString().padStart(digits, '0') : part.value
      )
      .join('')
  }
  const { comparison } = summary
  return (
    <section aria-label="Donation report results">
      <h2>
        {summary.range.from} to {summary.range.to} · {summary.range.currency}
      </h2>
      {summary.giftCount === 0 && <p>No settled gifts in this period and currency.</p>}
      <dl className={styles.metrics}>
        {(
          [
            ['Gross giving', summary.grossAmountMinor],
            ['Net giving', summary.netAmountMinor],
            ['Refunds and reversals', summary.refundedAmountMinor],
            ['Fees', summary.feeAmountMinor],
          ] as const
        ).map(([label, amount]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd aria-label={label}>{money(amount)}</dd>
          </div>
        ))}
        <div>
          <dt>Settled gifts</dt>
          <dd>{summary.giftCount}</dd>
        </div>
      </dl>
      <p>
        Net growth:{' '}
        {comparison.growthPercentage === null
          ? 'Not available (previous net is zero or negative)'
          : `${comparison.growthPercentage}%`}
        . Compared with {comparison.from} to {comparison.to}: {money(comparison.netAmountMinor)}.
      </p>
      <ReportTable
        title="Monthly giving"
        rows={summary.monthly.map((row) => ({ ...row, label: row.month }))}
        money={money}
        gross={summary.grossAmountMinor}
      />
      <div className={styles.mixes}>
        <ReportTable
          title="Provider mix"
          rows={summary.providerMix.map((row) => ({ ...row, label: providers[row.provider] }))}
          money={money}
          gross={summary.grossAmountMinor}
        />
        <ReportTable
          title="Cadence mix"
          rows={summary.cadenceMix.map((row) => ({ ...row, label: cadences[row.cadence] }))}
          money={money}
          gross={summary.grossAmountMinor}
        />
      </div>
    </section>
  )
}

function ReportTable({
  title,
  rows,
  money,
  gross,
}: {
  title: string
  rows: (DonationReportTotals & { label: string })[]
  money: (minor: number) => string
  gross: number
}) {
  return (
    <section className={styles.tableSection}>
      <h3>{title}</h3>
      <div
        className={styles.tableScroll}
        tabIndex={0}
        role="region"
        aria-label={`${title} table scroll area`}
      >
        <table aria-label={title}>
          <thead>
            <tr>
              <th scope="col">Period / source</th>
              <th scope="col">Gifts</th>
              <th scope="col">Gross</th>
              <th scope="col">Share of gross</th>
              <th scope="col">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const share = gross > 0 ? (row.grossAmountMinor / gross) * 100 : 0
              return (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.giftCount}</td>
                  <td>{money(row.grossAmountMinor)}</td>
                  <td>
                    <span>{share.toFixed(1)}%</span>
                    <span className={styles.bar} aria-hidden="true">
                      <span style={{ width: `${share}%` }} />
                    </span>
                  </td>
                  <td>{money(row.netAmountMinor)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
