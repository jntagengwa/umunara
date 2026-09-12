import { readPublicPosts } from '../../../lib/content-reads'
import { readPageNumber, type PageSearchParams } from '../../../lib/page-query'
import { PostList } from '../../../components/post-list'
import { Pagination } from '../../../components/pagination'

export default async function BlogPage({ searchParams }: { searchParams: PageSearchParams }) {
  const posts = await readPublicPosts(await readPageNumber(searchParams))
  return (
    <main className="page-content" id="main-content">
      <header className="page-introduction">
        <p className="section-label">From our community</p>
        <h1>Umunara Inc, Blog</h1>
      </header>
      <PostList posts={posts.data} />
      <Pagination {...posts} path="/blog" />
    </main>
  )
}
