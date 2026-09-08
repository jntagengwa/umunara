import { z } from 'zod'

export const linkAccountsSchema = z.object({
  accounts: z
    .array(
      z.object({
        id: z.string().min(1).max(255),
        name: z.string().min(1).max(200),
        mask: z.string().nullable(),
        type: z.string(),
        subtype: z.string().nullable(),
      })
    )
    .min(1)
    .max(100),
})
export type LinkAccount = z.infer<typeof linkAccountsSchema>['accounts'][number]
export interface PlaidLinkHandler {
  open(): void
  destroy(): void
}
interface PlaidLink {
  create(options: {
    token: string
    onSuccess(publicToken: string, metadata: unknown): void
    onExit(error: unknown): void
  }): PlaidLinkHandler
}
declare global {
  interface Window {
    Plaid?: PlaidLink
  }
}

export async function loadPlaidLink(): Promise<PlaidLink> {
  if (window.Plaid) return window.Plaid
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    script.async = true
    const timeout = window.setTimeout(() => {
      script.remove()
      reject(new Error('Bank connection unavailable.'))
    }, 15_000)
    script.onload = () => {
      window.clearTimeout(timeout)
      resolve()
    }
    script.onerror = () => {
      window.clearTimeout(timeout)
      script.remove()
      reject(new Error('Bank connection unavailable.'))
    }
    document.head.appendChild(script)
  })
  if (!window.Plaid) throw new Error('Bank connection unavailable.')
  return window.Plaid
}
