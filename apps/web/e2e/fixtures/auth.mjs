const authId = '33333333-3333-4333-8333-333333333333'

function session() {
  const user = {
    id: authId,
    email: 'new@example.test',
    email_confirmed_at: '2026-09-07',
    app_metadata: {},
    user_metadata: {},
  }
  const accessToken = [
    'eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(
      JSON.stringify({
        sub: authId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        testRole: 'pending',
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.')
  return {
    access_token: accessToken,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user,
  }
}

// Only the external Auth boundary is simulated. Application handlers and SSR cookies stay real.
export function handleAuth(url, body, response) {
  if (url.pathname === '/auth/v1/signup') {
    response.end(
      JSON.stringify(
        body.email.startsWith('immediate@')
          ? session()
          : { id: authId, email: body.email, email_confirmed_at: null },
      ),
    )
  } else if (url.pathname === '/auth/v1/token') {
    if (
      url.searchParams.get('grant_type') === 'password' &&
      body.password !== 'test-password-123'
    ) {
      response.statusCode = 400
      response.end(JSON.stringify({ code: 'invalid_credentials', message: 'Invalid credentials' }))
    } else {
      response.end(JSON.stringify(session()))
    }
  } else if (url.pathname === '/auth/v1/verify') {
    if (body.token_hash !== 'valid-email-token') {
      response.statusCode = 403
      response.end(JSON.stringify({ code: 'otp_expired', message: 'Expired' }))
    } else {
      response.end(JSON.stringify(session()))
    }
  } else if (url.pathname === '/auth/v1/logout') {
    response.statusCode = 204
    response.end()
  } else {
    return false
  }
  return true
}
