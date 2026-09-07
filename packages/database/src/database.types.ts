export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      audit_log: Table<AuditLogRow, AuditLogInsert, AuditLogUpdate>
      categories: Table<CategoryRow, CategoryInsert, CategoryUpdate>
      event_registrations: Table<EventRegistrationRow, EventRegistrationInsert, EventRegistrationUpdate>
      events: Table<EventRow, EventInsert, EventUpdate>
      media_assets: Table<MediaAssetRow, MediaAssetInsert, MediaAssetUpdate>
      posts: Table<PostRow, PostInsert, PostUpdate>
      profiles: Table<ProfileRow, ProfileInsert, ProfileUpdate>
      resources: Table<ResourceRow, ResourceInsert, ResourceUpdate>
      site_settings: Table<SiteSettingRow, SiteSettingInsert, SiteSettingUpdate>
    }
    Views: Record<string, never>
    Functions: {
      register_for_event: {
        Args: { target_event_id: string }
        Returns: EventRegistrationRow
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type Table<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type ContentStatus = 'draft' | 'published'
type ContentVisibility = 'public' | 'member'
type ProfileRole = 'pending' | 'member' | 'editor' | 'admin'

export interface ProfileRow {
  approved_at: string | null
  avatar_url: string | null
  created_at: string
  email: string | null
  full_name: string | null
  id: string
  role: ProfileRole
  updated_at: string
}

export interface ProfileInsert {
  approved_at?: string | null
  avatar_url?: string | null
  created_at?: string
  email?: string | null
  full_name?: string | null
  id: string
  role?: ProfileRole
  updated_at?: string
}

export interface ProfileUpdate {
  approved_at?: string | null
  avatar_url?: string | null
  email?: string | null
  full_name?: string | null
  role?: ProfileRole
  updated_at?: string
}

export interface CategoryRow {
  created_at: string
  description: string | null
  id: string
  name: string
  slug: string
  updated_at: string
}

export type CategoryInsert = Partial<Omit<CategoryRow, 'id' | 'created_at' | 'updated_at'>> & Pick<CategoryRow, 'name' | 'slug'>
export type CategoryUpdate = Partial<Omit<CategoryRow, 'id' | 'created_at'>>

export interface PostRow {
  author_id: string
  category_id: string | null
  content: string
  created_at: string
  excerpt: string | null
  id: string
  published_at: string | null
  slug: string
  status: ContentStatus
  title: string
  updated_at: string
  visibility: ContentVisibility
}

export type PostInsert = Partial<Omit<PostRow, 'id' | 'created_at' | 'updated_at' | 'author_id' | 'content' | 'status' | 'visibility'>> & Pick<PostRow, 'title' | 'slug'> & {
  author_id?: string
  content?: string
  status?: ContentStatus
  visibility?: ContentVisibility
}
export type PostUpdate = Partial<Omit<PostRow, 'id' | 'created_at'>>

export interface EventRow {
  author_id: string
  capacity: number | null
  created_at: string
  description: string
  ends_at: string | null
  id: string
  location: string | null
  online_url: string | null
  published_at: string | null
  starts_at: string
  status: ContentStatus
  title: string
  updated_at: string
  visibility: ContentVisibility
}

export type EventInsert = Partial<Omit<EventRow, 'id' | 'created_at' | 'updated_at' | 'author_id' | 'description' | 'status' | 'visibility'>> & Pick<EventRow, 'title' | 'starts_at'> & {
  author_id?: string
  description?: string
  status?: ContentStatus
  visibility?: ContentVisibility
}
export type EventUpdate = Partial<Omit<EventRow, 'id' | 'created_at'>>

export interface EventRegistrationRow {
  created_at: string
  event_id: string
  id: string
  profile_id: string
  registered_at: string
  status: 'registered' | 'cancelled'
  updated_at: string
}

export type EventRegistrationInsert = Partial<Omit<EventRegistrationRow, 'id' | 'created_at' | 'updated_at' | 'profile_id' | 'registered_at' | 'status'>> & Pick<EventRegistrationRow, 'event_id'> & {
  profile_id?: string
  registered_at?: string
  status?: EventRegistrationRow['status']
}
export type EventRegistrationUpdate = Partial<Omit<EventRegistrationRow, 'id' | 'created_at'>>

export interface MediaAssetRow {
  alt_text: string | null
  bucket_id: string
  byte_size: number | null
  created_at: string
  id: string
  mime_type: string | null
  storage_path: string
  updated_at: string
  uploaded_by: string
  visibility: ContentVisibility
}

export type MediaAssetInsert = Partial<Omit<MediaAssetRow, 'id' | 'created_at' | 'updated_at' | 'uploaded_by' | 'bucket_id' | 'visibility'>> & Pick<MediaAssetRow, 'storage_path'> & {
  bucket_id?: string
  uploaded_by?: string
  visibility?: ContentVisibility
}
export type MediaAssetUpdate = Partial<Omit<MediaAssetRow, 'id' | 'created_at'>>

export interface ResourceRow {
  author_id: string
  created_at: string
  description: string | null
  id: string
  published_at: string | null
  status: ContentStatus
  storage_path: string
  title: string
  updated_at: string
  visibility: ContentVisibility
}

export type ResourceInsert = Partial<Omit<ResourceRow, 'id' | 'created_at' | 'updated_at' | 'author_id' | 'status' | 'visibility'>> & Pick<ResourceRow, 'title' | 'storage_path'> & {
  author_id?: string
  status?: ContentStatus
  visibility?: ContentVisibility
}
export type ResourceUpdate = Partial<Omit<ResourceRow, 'id' | 'created_at'>>

export interface SiteSettingRow {
  created_at: string
  id: string
  key: string
  updated_at: string
  value: Json
}

export type SiteSettingInsert = Partial<Omit<SiteSettingRow, 'id' | 'created_at' | 'updated_at' | 'value'>> & Pick<SiteSettingRow, 'key'> & {
  value?: Json
}
export type SiteSettingUpdate = Partial<Omit<SiteSettingRow, 'id' | 'created_at'>>

export interface AuditLogRow {
  action: string
  actor_id: string | null
  created_at: string
  details: Json
  entity_id: string | null
  entity_type: string
  id: string
  updated_at: string
}

export type AuditLogInsert = Partial<Omit<AuditLogRow, 'id' | 'created_at' | 'updated_at' | 'details'>> & Pick<AuditLogRow, 'action' | 'entity_type'> & {
  details?: Json
}
export type AuditLogUpdate = Partial<Omit<AuditLogRow, 'id' | 'created_at'>>
