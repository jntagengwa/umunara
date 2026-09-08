import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './database.types'
import { getServerConfig } from './server-config'

export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const { url, key } = getServerConfig()
  const client = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        const previousCookies = response.cookies.getAll()
        response = NextResponse.next({ request })
        previousCookies.forEach((cookie) => response.cookies.set(cookie))
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
        response.headers.set('Cache-Control', 'private, no-store')
      },
    },
  })
  // getUser validates with Auth and refreshes expired sessions in the installed SDK.
  const { data } = await client.auth.getUser()
  if (data.user) response.headers.set('Cache-Control', 'private, no-store')
  return response
}
