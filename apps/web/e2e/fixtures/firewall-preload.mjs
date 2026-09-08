// Test-only external boundary: execute the real SDK, routing its one fixed host to our fixture.
const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.origin === 'https://sandbox.plaid.com') {
    return originalFetch('http://127.0.0.1:55431/__test/plaid' + url.pathname, init)
  }
  if (url.origin === 'https://bank-vault.example.test') {
    return originalFetch('http://127.0.0.1:55431/__test/vault' + url.pathname, init)
  }
  if (url.origin === 'https://api.stripe.com') {
    return originalFetch('http://127.0.0.1:55431/__test/stripe' + url.pathname + url.search, init)
  }
  if (url.origin === 'https://api-m.sandbox.paypal.com') {
    return originalFetch('http://127.0.0.1:55431/__test/paypal' + url.pathname + url.search, init)
  }
  if (
    url.origin === 'https://umunara-e2e.vercel.app' &&
    url.pathname.startsWith('/.well-known/vercel/rate-limit-api/')
  ) {
    return originalFetch(
      'http://127.0.0.1:55431/__test/firewall/' + url.pathname.split('/').at(-1),
      init,
    )
  }
  return originalFetch(input, init)
}
