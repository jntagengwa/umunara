'use client'

import { useEffect, useRef, useState } from 'react'
import { bankConnectionDtoSchema, bankLinkTokenSchema, type Role } from '@umunara/schemas'
import {
  linkAccountsSchema,
  loadPlaidLink,
  type LinkAccount,
  type PlaidLinkHandler,
} from './plaid-link'

async function post(path: string, input: unknown): Promise<unknown> {
  const response = await fetch(`/api/v1/admin/bank/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error('Bank connection unavailable.')
  return response.json()
}
export function ConnectBankAccount({ role }: { role: Role }) {
  const [consent, setConsent] = useState(false)
  const [phase, setPhase] = useState<
    'ready' | 'linking' | 'selecting' | 'saving' | 'complete' | 'uncertain'
  >('ready')
  const [accounts, setAccounts] = useState<LinkAccount[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [institution, setInstitution] = useState('')
  const publicToken = useRef<string | null>(null)
  const handler = useRef<PlaidLinkHandler | null>(null)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      handler.current?.destroy()
      publicToken.current = null
    }
  }, [])

  async function connect(): Promise<void> {
    if (!consent || busy.current) return
    busy.current = true
    setError('')
    setPhase('linking')
    try {
      const token = bankLinkTokenSchema.parse(
        await post('link-token', { businessAccountConsent: true })
      )
      const plaid = await loadPlaidLink()
      if (!mounted.current) return
      handler.current?.destroy()
      handler.current = plaid.create({
        token: token.linkToken,
        onSuccess: (token, metadata) => {
          if (!mounted.current) return
          const parsed = linkAccountsSchema.safeParse(metadata)
          const eligible = parsed.success
            ? parsed.data.accounts.filter(
                (a) => a.type === 'depository' && ['checking', 'savings'].includes(a.subtype ?? '')
              )
            : []
          if (!eligible.length || !token) {
            setError('No eligible US business checking or savings accounts were found.')
            setPhase('ready')
            busy.current = false
            return
          }
          publicToken.current = token
          setAccounts(eligible)
          setSelected([])
          setPhase('selecting')
          busy.current = false
        },
        onExit: (cause) => {
          if (mounted.current) {
            setPhase('ready')
            setError(
              cause ? 'Unable to open your bank. Please try again.' : 'Bank connection cancelled.'
            )
            busy.current = false
          }
        },
      })
      handler.current.open()
    } catch {
      if (mounted.current) {
        setError('Unable to open your bank. Please try again later.')
        setPhase('ready')
        busy.current = false
      }
    }
  }
  async function save(): Promise<void> {
    if (!publicToken.current || !selected.length || busy.current) return
    busy.current = true
    setPhase('saving')
    setError('')
    const token = publicToken.current
    publicToken.current = null
    try {
      const connection = bankConnectionDtoSchema.parse(
        await post('exchange-token', {
          businessAccountConsent: true,
          publicToken: token,
          selectedAccountIds: selected,
        })
      )
      if (mounted.current) {
        setInstitution(connection.institutionName)
        setPhase('complete')
      }
    } catch {
      if (mounted.current) {
        setError(
          'The connection could not be confirmed. Contact an administrator before reconnecting.'
        )
        setPhase('uncertain')
      }
    } finally {
      handler.current?.destroy()
      handler.current = null
      busy.current = false
    }
  }
  if (role !== 'admin') return null
  return (
    <section aria-labelledby="connect-bank-title">
      <h1 id="connect-bank-title">Connect a bank account</h1>
      <p>
        Connect Umunara’s US business checking or savings accounts for read-only transaction
        reporting. Plaid handles your bank sign-in and consent.
      </p>
      {phase === 'ready' && (
        <>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{' '}
            I am authorized to connect these US business accounts for Umunara.
          </label>
          <p>
            <button type="button" disabled={!consent} onClick={() => void connect()}>
              Connect bank account
            </button>
          </p>
        </>
      )}
      {phase === 'linking' && <p role="status">Opening secure bank connection…</p>}
      {(phase === 'selecting' || phase === 'saving') && (
        <fieldset disabled={phase === 'saving'}>
          <legend>Select the business accounts to connect</legend>
          {accounts.map((account) => (
            <p key={account.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(account.id)}
                  onChange={(e) =>
                    setSelected((current) =>
                      e.target.checked
                        ? [...current, account.id]
                        : current.filter((id) => id !== account.id)
                    )
                  }
                />{' '}
                {account.name}
                {account.mask && /^[0-9]{2,4}$/.test(account.mask) ? ` ••${account.mask}` : ''}
              </label>
            </p>
          ))}
          <button type="button" disabled={!selected.length} onClick={() => void save()}>
            Connect selected accounts
          </button>
          <button
            type="button"
            onClick={() => {
              publicToken.current = null
              handler.current?.destroy()
              handler.current = null
              setPhase('ready')
              setAccounts([])
              setSelected([])
            }}
          >
            Cancel
          </button>
        </fieldset>
      )}
      {phase === 'saving' && <p role="status">Saving your bank connection…</p>}
      {phase === 'complete' && (
        <p role="status">{institution} connected. Initial transaction sync requested.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
