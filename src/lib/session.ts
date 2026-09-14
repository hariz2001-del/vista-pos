import { apiRequest, readToken, writeToken } from './http'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: 'CASHIER' | 'OWNER_FOOD' | 'OWNER_DRINKS'
}

/**
 * One account signs in to both the POS and the owner RMS. Per-person
 * accountability at the counter comes from the PIN at shift open and close.
 */
export async function signIn(email: string, password: string): Promise<SessionUser> {
  const result = await apiRequest<{ token: string; user: SessionUser }>('POST', '/auth/login', {
    email,
    password,
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
