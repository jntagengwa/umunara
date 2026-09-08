import 'server-only'
import { revalidateTag, updateTag } from 'next/cache'

export interface CacheInvalidator {
  invalidate(tags: readonly string[]): void
}

// This adapter may only be selected inside a Server Action.
export const serverActionCache: CacheInvalidator = {
  invalidate: (tags) => {
    for (const tag of new Set(tags)) updateTag(tag)
  },
}

export const routeCache: CacheInvalidator = {
  invalidate: (tags) => {
    for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 })
  },
}

export const backgroundCache: CacheInvalidator = {
  invalidate: (tags) => {
    for (const tag of new Set(tags)) revalidateTag(tag, 'max')
  },
}
