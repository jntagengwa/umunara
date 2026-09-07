import { requirePageRole } from '../../../../lib/page-access'
import { readPageNumber, type PageSearchParams } from '../../../../lib/page-query'
import { Pagination } from '../../../../components/pagination'
import { RequestButton } from '../../../../components/request-button'

export default async function MemberApprovalsPage({
  searchParams,
}: { searchParams?: PageSearchParams } = {}) {
  const { services, actor } = await requirePageRole('admin')
  const members = await services.membership.listPending(actor, {
    page: await readPageNumber(searchParams),
    pageSize: 25,
  })
  return (
    <main className="page-content" id="main-content">
      <h1>Member approvals</h1>
      {members.data.length === 0 && <p>No members are awaiting approval.</p>}
      {members.data.map((member) => (
        <article key={member.id}>
          <h2>{member.fullName ?? member.email ?? 'New member'}</h2>
          {member.fullName && <p>{member.email}</p>}
          <RequestButton
            endpoint={`/api/v1/admin/members/${member.id}/approve`}
            label="Approve member"
            pendingLabel="Approving…"
            successMessage="Member approved."
            refreshOnSuccess
          />
        </article>
      ))}
      <Pagination {...members} path="/admin/members" />
    </main>
  )
}
