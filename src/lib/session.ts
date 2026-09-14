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

export function signOut(): void {
  writeToken(null)
}

export function hasSession(): boolean {
  return readToken() !== null
}
