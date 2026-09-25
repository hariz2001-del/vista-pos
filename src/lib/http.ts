/**
 * The one way the POS talks to api-vista.
 *
 * Errors come back typed, because the caller has to tell three very different
 * situations apart:
 *
 *  - `ApiError` — the server answered and refused. Retrying the same request gets
 *    the same answer, so show the server's message.
 *  - `SessionExpiredError` — the token is missing or expired. Nothing queued on
 *    the tablet is lost; the cashier signs in again and the flush resumes.
 *  - `NetworkError` — no answer at all. The request may or may not have landed,
 *    which is exactly the case the idempotency key exists for.
 */

const TOKEN_KEY = 'vista.pos.token'
const TIMEOUT_MS = 15_000

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
)

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super('You have been signed out. Sign in again to continue.')
    this.name = 'SessionExpiredError'
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Cannot reach the server.')
    this.name = 'NetworkError'
  }
}

// Storage can throw outright in some contexts (private mode, blocked site data),
// so every access is guarded. Losing the token only means signing in again.
export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing to do — the session simply will not survive a reload.
  }
}

const expiryListeners = new Set<() => void>()

/** Called whenever the server rejects the token. Returns an unsubscribe. */
export function onSessionExpired(listener: () => void): () => void {
  expiryListeners.add(listener)
  return () => {
    expiryListeners.delete(listener)
  }
}

type ErrorBody = { error?: string; message?: string }

export async function apiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = readToken()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // Only present when there is one: a GET must not carry a body at all.
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    })
  } catch {
    throw new NetworkError()
  } finally {
    window.clearTimeout(timer)
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const error = (payload ?? {}) as ErrorBody
    const code = error.error ?? 'server:UNEXPECTED'

    // Only a rejected token means the session is gone. A wrong PIN is also a 401,
    // but it is an answer to this request, not a reason to sign the tablet out.
    if (code === 'auth:UNAUTHORIZED') {
      writeToken(null)
      for (const listener of expiryListeners) listener()
      throw new SessionExpiredError()
    }

    throw new ApiError(code, error.message ?? 'The server could not complete that.', response.status)
  }

  return payload as T
}
