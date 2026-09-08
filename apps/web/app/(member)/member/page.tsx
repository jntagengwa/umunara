import { requirePageRole } from '../../../lib/page-access'
import { readMemberPosts } from '../../../lib/content-reads'
import { PostList } from '../../../components/post-list'
import { Pagination } from '../../../components/pagination'
import { readPageNumber, type PageSearchParams } from '../../../lib/page-query'

export default async function MemberPage({
  searchParams,
}: { searchParams?: PageSearchParams } = {}) {
  await requirePageRole('member')
  const posts = await readMemberPosts(await readPageNumber(searchParams))
  return (
    <main className="page-content" id="main-content">
      <h1>Member community</h1>
      <PostList posts={posts.data} emptyMessage="There are no member posts yet." />
      <Pagination {...posts} path="/member" />
    </main>
  )
}
