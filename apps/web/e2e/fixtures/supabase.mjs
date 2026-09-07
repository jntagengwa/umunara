import { createServer } from 'node:http'

// Loopback-only external Auth/PostgREST fixture. Application routes, services and caching stay real.
let hero = null
let requests = []
const id = '11111111-1111-4111-8111-111111111111'
const pendingId = '22222222-2222-4222-8222-222222222222'
let approved = false
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:55431')
  response.setHeader('Content-Type', 'application/json')
  if (url.pathname === '/health') return response.end('{}')
  if (url.pathname === '/__test/requests') {
    if (request.method === 'DELETE') requests = []
    return response.end(JSON.stringify(requests))
  }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const input = Buffer.concat(chunks).toString()
  const body = input ? JSON.parse(input) : null
  requests.push({ path: url.pathname, query: url.search, method: request.method })
  let role = 'pending'
  let userId = id
  try {
    const token = request.headers.authorization?.slice('Bearer '.length)
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    role = claims.testRole
    userId = claims.sub
    if (userId === pendingId && approved) role = 'member'
  } catch {
    /* Anonymous/public and service keys are intentionally not session tokens. */
  }
  if (url.pathname === '/auth/v1/user') {
    return response.end(
      JSON.stringify({
        id: userId,
        email: 'member@example.test',
        email_confirmed_at: '2026-01-01',
        app_metadata: {},
        user_metadata: {},
      }),
    )
  }
  if (url.pathname === '/rest/v1/profiles') {
    const pendingProfile = {
      id: pendingId,
      role: approved ? 'member' : 'pending',
      approved_at: approved ? '2026-09-07' : null,
      full_name: 'New member',
      email: 'new@example.test',
      created_at: '2026-09-01',
      updated_at: '2026-09-07',
    }
    if (request.method === 'PATCH') {
      if (role !== 'admin' || url.searchParams.get('role') !== 'eq.pending') {
        response.statusCode = 403
        return response.end(JSON.stringify({ code: '42501' }))
      }
      approved = true
      return response.end(
        JSON.stringify({ ...pendingProfile, role: 'member', approved_at: '2026-09-07' }),
      )
    }
    if (url.searchParams.get('role') === 'eq.pending') {
      response.setHeader('Content-Range', approved ? '*/0' : '0-0/1')
      return response.end(JSON.stringify(approved ? [] : [pendingProfile]))
    }
    return response.end(
      JSON.stringify({ id: userId, role, approved_at: role === 'pending' ? null : '2026-01-01' }),
    )
  }
  if (url.pathname === '/rest/v1/site_settings') {
    if (request.method === 'POST') hero = body.value
    return response.end(
      JSON.stringify(hero === null ? null : { id, key: 'home-hero', value: hero }),
    )
  }
  if (url.pathname === '/rest/v1/audit_log') return response.end('{}')
  response.setHeader('Content-Range', '0-0/1')
  if (url.pathname === '/rest/v1/posts') {
    const member = url.searchParams.get('visibility') === 'eq.member'
    return response.end(
      JSON.stringify([
        {
          id,
          title: member ? 'Member prayer notes' : 'A community of prayer',
          slug: 'community-prayer',
          excerpt: 'Gather with us.',
          content: 'Welcome to the Umunara community.',
          author_id: id,
          category_id: null,
          status: 'published',
          visibility: member ? 'member' : 'public',
          published_at: '2026-09-01',
          created_at: '2026-09-01',
          updated_at: '2026-09-01',
        },
      ]),
    )
  }
  if (url.pathname === '/rest/v1/events') {
    const member = url.searchParams.get('visibility') === 'eq.member'
    return response.end(
      JSON.stringify([
        {
          id,
          title: member ? 'Member prayer gathering' : 'Friday prayer',
          description: 'Join our community.',
          starts_at: '2026-09-11T22:00:00Z',
          ends_at: null,
          location: 'Conference call',
          online_url: null,
          capacity: null,
          status: 'published',
          visibility: member ? 'member' : 'public',
        },
      ]),
    )
  }
  if (url.pathname === '/rest/v1/resources') {
    const resource = {
      id: pendingId,
      title: 'Member prayer guide',
      description: 'A guide for members.',
      storage_path: 'guide.pdf',
      status: 'published',
      visibility: 'member',
    }
    return response.end(JSON.stringify(url.searchParams.has('id') ? resource : [resource]))
  }
  if (url.pathname === '/storage/v1/object/sign/resources/guide.pdf') {
    if (request.headers.authorization !== 'Bearer local-test-service-key') {
      response.statusCode = 400
      return response.end(
        JSON.stringify({ message: 'Object not found', statusCode: '404', error: 'not_found' }),
      )
    }
    return response.end(
      JSON.stringify({ signedURL: '/object/sign/resources/guide.pdf?token=short-lived-test' }),
    )
  }
  if (url.pathname === '/rest/v1/rpc/register_for_event') {
    return response.end(
      JSON.stringify({
        id,
        event_id: body.target_event_id,
        profile_id: userId,
        status: 'registered',
        registered_at: '2026-09-07',
      }),
    )
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: 'Unknown fixture path' }))
})
server.listen(55431, '127.0.0.1')
