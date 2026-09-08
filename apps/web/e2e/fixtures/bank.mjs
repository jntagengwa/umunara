// Loopback-only provider, encrypted secret-store, and RPC boundaries. No database is used.
export async function handleBankFixture(request, response, url) {
  if (
    !url.pathname.startsWith('/__test/plaid/') &&
    !url.pathname.startsWith('/__test/vault/') &&
    url.pathname !== '/rest/v1/rpc/create_bank_connection'
  )
    return false
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const input = JSON.parse(Buffer.concat(chunks).toString())
  let result = {}
  if (url.pathname === '/__test/plaid/link/token/create') result = { link_token: 'link-fixture' }
  if (url.pathname === '/__test/plaid/item/public_token/exchange') {
    if (input.public_token === 'public-failure') {
      response.statusCode = 503
      result = { error: 'access-private-provider-error' }
    } else result = { item_id: 'item-private-fixture', access_token: 'access-private-fixture' }
  }
  if (url.pathname === '/__test/plaid/accounts/get')
    result = {
      item: { institution_id: 'ins_fixture' },
      accounts: [
        {
          account_id: 'a1',
          name: 'Business checking',
          mask: '1234',
          type: 'depository',
          subtype: 'checking',
          balances: { iso_currency_code: 'USD' },
        },
      ],
    }
  if (url.pathname === '/__test/plaid/institutions/get_by_id')
    result = { institution: { name: 'Fixture Bank', country_codes: ['US'] } }
  if (url.pathname.startsWith('/__test/vault/')) {
    if (!input.data?.ciphertext || JSON.stringify(input).includes('access-private-fixture'))
      response.statusCode = 400
    result = { data: { version: 1 } }
  }
  if (url.pathname === '/rest/v1/rpc/create_bank_connection') {
    if (
      request.headers.authorization !== 'Bearer local-test-service-key' ||
      input.connection_input.accounts.length !== 1 ||
      JSON.stringify(input).includes('access-private-fixture')
    )
      response.statusCode = 400
    result = {
      id: input.connection_input.connectionId,
      institutionName: input.connection_input.institutionName,
      status: 'active',
      lastSyncedAt: null,
    }
  }
  response.end(JSON.stringify(result))
  return true
}
