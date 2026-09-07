import 'server-only'

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from './database.types'
import { getServerConfig } from './server-config'

export async function createServerClient() {
  const cookieStore = await cookies()
  const { url, key } = getServerConfig()

  return createSupabaseServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components are read-only. apps/web/proxy.ts persists session refreshes.
        }
      },
    },
  })
}
