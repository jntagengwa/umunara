import { ConnectBankAccount } from '../../../../features/bank/connect-bank-account'
import { BankReviewTable } from '../../../../features/bank/bank-review-table'
import { requirePageRole } from '../../../../lib/page-access'

export default async function BankConnectionPage() {
  const { actor } = await requirePageRole('admin')
  return (
    <>
      <ConnectBankAccount role={actor.role} />
      <BankReviewTable role={actor.role} />
    </>
  )
}
