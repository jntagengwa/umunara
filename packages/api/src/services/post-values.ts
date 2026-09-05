import type { PostRow, PostUpdate } from '@umunara/database'
import type { PostDto, PostUpdateInput } from '@umunara/schemas'

export function toPostDto(row: PostRow): PostDto {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    authorId: row.author_id,
    categoryId: row.category_id,
    status: row.status,
    visibility: row.visibility,
    publishedAt: row.published_at,
  }
}

export function postValues(input: PostUpdateInput): PostUpdate {
  return {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.slug === undefined ? {} : { slug: input.slug }),
    ...(input.excerpt === undefined ? {} : { excerpt: input.excerpt }),
    ...(input.content === undefined ? {} : { content: input.content }),
    ...(input.categoryId === undefined ? {} : { category_id: input.categoryId }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
  }
}
