import { readPublicPosts } from '../../../lib/content-reads'
import { readPageNumber, type PageSearchParams } from '../../../lib/page-query'
import { PostList } from '../../../components/post-list'
import { Pagination } from '../../../components/pagination'

export default async function BlogPage({ searchParams }: { searchParams: PageSearchParams }) {
  const posts = await readPublicPosts(await readPageNumber(searchParams))
  return (
    <main className="page-content" id="main-content">
      <h1>Umunara Inc, Blog</h1>
      <PostList posts={posts.data} />
      <Pagination {...posts} path="/blog" />
    </main>
  )
}
