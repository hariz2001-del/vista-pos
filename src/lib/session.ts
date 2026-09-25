import { apiRequest, readToken, writeToken } from './http'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: 'CASHIER' | 'OWNER_FOOD' | 'OWNER_DRINKS'
}

/**
 * The business has one account. The owner signs the counter in once; after that
 * the cashier only ever uses the PIN, and nothing on the tablet signs it out.
 */
export async function signIn(email: string, password: string): Promise<SessionUser> {
  // A counter session: it never expires, and it cannot open the owner's books —
  // a stolen tablet can sell, but cannot reach the money. The owner signs the
  // counter out from the RMS when they need to.
  const result = await apiRequest<{ token: string; user: SessionUser }>('POST', '/auth/login', {
    email,
    password,
    scope: 'COUNTER',
  })
  writeToken(result.token)
  return result.user
}

/**
 * Arriving from vistahub.my: swap the one-time code in the address for a
 * counter session. The hub puts it in the fragment (`#handoff=…`), which the
 * browser never sends to any server.
 */
export async function redeemHandoff(code: string): Promise<SessionUser> {
  const result = await apiRequest<{ token: string; user: SessionUser }>(
    'POST',
    '/auth/handoff/redeem',
    { code },
  )
  writeToken(result.token)
  return result.user
}

/** The handoff code in the address bar, if the owner just came from the hub. */
export function handoffCodeInUrl(): string | null {
  const match = /(?:^#|&)handoff=([^&]+)/.exec(window.location.hash)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

/** Take the code out of the address bar, so a reload cannot try to reuse it. */
export function clearHandoffFromUrl(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

export function signOut(): void {
  writeToken(null)
}

export function hasSession(): boolean {
  return readToken() !== null
}
