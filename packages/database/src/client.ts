'use client'

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'

import type { Database } from './database.types'

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.')
  }

  return url
}

function getSupabasePublicKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required.')
  }

  return key
}

export function createBrowserClient() {
  if (typeof window === 'undefined') {
    throw new Error('createBrowserClient must only be called in browser code.')
  }

  return createSupabaseBrowserClient<Database>(getSupabaseUrl(), getSupabasePublicKey())
}
