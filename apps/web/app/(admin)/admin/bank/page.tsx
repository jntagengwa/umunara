import { ConnectBankAccount } from '../../../../features/bank/connect-bank-account'
import { requirePageRole } from '../../../../lib/page-access'

export default async function BankConnectionPage() {
  const { actor } = await requirePageRole('admin')
  return <ConnectBankAccount role={actor.role} />
}
