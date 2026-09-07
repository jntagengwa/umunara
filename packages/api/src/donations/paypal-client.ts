import 'server-only'
import { z } from 'zod'
import { ApiError } from '../errors'

export interface PayPalConfig {
  clientId: string
  clientSecret: string
  webhookId: string
  environment: 'sandbox' | 'live'
  applicationOrigin: string
  monthlyPlanId?: string
  yearlyPlanId?: string
}

export class PayPalClient {
  readonly apiOrigin: string
  readonly approvalHost: string
  readonly applicationOrigin: string
  private token: { value: string; expiresAt: number } | undefined

  constructor(readonly config: PayPalConfig) {
    this.apiOrigin =
      config.environment === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com'
    this.approvalHost = config.environment === 'live' ? 'www.paypal.com' : 'www.sandbox.paypal.com'
    const url = new URL(config.applicationOrigin)
    if (
      (!['https:'].includes(url.protocol) &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !config.clientId ||
      !config.clientSecret ||
      !config.webhookId
    )
      throw new Error('Invalid PayPal configuration.')
    this.applicationOrigin = url.origin
  }

  async request(path: string, body?: unknown, requestId?: string): Promise<unknown> {
    return this.send(path, body === undefined ? undefined : JSON.stringify(body), requestId)
  }

  async send(path: string, body?: string, requestId?: string): Promise<unknown> {
    try {
      if (!this.token || this.token.expiresAt <= Date.now()) {
        const response = await fetch(`${this.apiOrigin}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) throw new Error('OAuth unavailable.')
        const token = z
          .object({ access_token: z.string().min(1), expires_in: z.number().positive() })
          .parse(await response.json())
        this.token = {
          value: token.access_token,
          expiresAt: Date.now() + Math.max(0, token.expires_in - 30) * 1000,
        }
      }
      const response = await fetch(`${this.apiOrigin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${this.token.value}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
          ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
        },
        ...(body === undefined ? {} : { body }),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error('Provider unavailable.')
      return await response.json()
    } catch {
      throw new ApiError(503, 'PayPal is temporarily unavailable. Please try again later.')
    }
  }
}
