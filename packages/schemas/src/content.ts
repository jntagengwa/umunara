export type ContentVisibility = 'public' | 'member'

export type PublicationStatus = 'draft' | 'published'

export interface PostDto {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string
  authorId: string
  categoryId: string | null
  status: PublicationStatus
  visibility: ContentVisibility
  publishedAt: string | null
}

export interface EventDto {
  id: string
  title: string
  description: string
  startsAt: string
  endsAt: string | null
  location: string | null
  onlineUrl: string | null
  capacity: number | null
  status: PublicationStatus
  visibility: ContentVisibility
}

export interface ResourceDto {
  id: string
  title: string
  description: string | null
  storagePath: string
  visibility: ContentVisibility
}
