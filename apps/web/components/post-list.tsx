import type { PostDto } from '@umunara/schemas'

export function PostList({
  posts,
  emptyMessage = 'There are no published posts yet.',
}: {
  posts: PostDto[]
  emptyMessage?: string
}) {
  if (posts.length === 0) return <p>{emptyMessage}</p>
  return (
    <div className="post-grid">
      {posts.map((post) => (
        <article className="content-card" key={post.id}>
          <h2>{post.title}</h2>
          {post.excerpt && <p>{post.excerpt}</p>}
          <div className="post-body">{post.content}</div>
        </article>
      ))}
    </div>
  )
}
