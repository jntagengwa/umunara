import { NextResponse } from 'next/server'
import { createSessionService } from '../service'

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const code = params.get('code')
  const tokenHash = params.get('token_hash')
  const input = code ? { code } : tokenHash && params.get('type') === 'email' ? { tokenHash } : null
  const confirmed = input ? await (await createSessionService()).confirm(input) : false
  const response = NextResponse.redirect(
    new URL(confirmed ? '/account' : '/sign-in?confirmation=failed', request.url),
    303,
  )
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
