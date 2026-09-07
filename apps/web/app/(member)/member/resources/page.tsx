import { requirePageRole } from '../../../../lib/page-access'
import { readPageNumber, type PageSearchParams } from '../../../../lib/page-query'
import { Pagination } from '../../../../components/pagination'
import { ResourceDownload } from '../../../../components/resource-download'

export default async function MemberResourcesPage({
  searchParams,
}: { searchParams?: PageSearchParams } = {}) {
  const { services, actor } = await requirePageRole('member')
  const resources = await services.resources.list(actor, {
    page: await readPageNumber(searchParams),
    pageSize: 12,
  })
  return (
    <main className="page-content" id="main-content">
      <h1>Member resources</h1>
      {resources.data.length === 0 && <p>No resources are available yet.</p>}
      {resources.data.map((resource) => (
        <article key={resource.id}>
          <h2>{resource.title}</h2>
          <p>{resource.description}</p>
          <ResourceDownload resourceId={resource.id} />
        </article>
      ))}
      <Pagination {...resources} path="/member/resources" />
    </main>
  )
}
