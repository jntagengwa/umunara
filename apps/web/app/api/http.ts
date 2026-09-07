import { ApiError } from '@umunara/api'
import { RepositoryError } from '@umunara/database/repositories'
import { ZodError } from 'zod'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

export async function jsonResponse(
  operation: () => Promise<unknown>,
  status = 200,
): Promise<Response> {
  try {
    return Response.json(await operation(), {
      status,
      headers: privateHeaders,
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: 'Invalid request.',
          issues: error.issues.map(({ path, message }) => ({ path, message })),
        },
        { status: 400, headers: privateHeaders },
      )
    }
    if (error instanceof ApiError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers: privateHeaders },
      )
    if (error instanceof RepositoryError) {
      if (error.code === 'PGRST116')
        return Response.json(
          { error: 'Record not found.' },
          { status: 404, headers: privateHeaders },
        )
      if (error.code === '23505')
        return Response.json(
          { error: 'A record with that value already exists.' },
          { status: 409, headers: privateHeaders },
        )
      if (error.code === '42501')
        return Response.json(
          { error: 'Permission denied.' },
          { status: 403, headers: privateHeaders },
        )
    }
    console.error(
      JSON.stringify({
        event: 'api_request_failed',
        errorType: error instanceof Error ? error.name : 'unknown',
      }),
    )
    return Response.json(
      { error: 'Unable to complete the request.' },
      { status: 500, headers: privateHeaders },
    )
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new ApiError(403, 'Cross-origin mutations are not allowed.')
  }
}

export async function readJson(request: Request): Promise<unknown> {
  requireSameOrigin(request)
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new ApiError(415, 'Use application/json.')
  }
  try {
    return await request.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON.')
  }
}
