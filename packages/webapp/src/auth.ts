/**
 * auth.ts
 * Client-side password gate using the Web Crypto SHA-256 API.
 * No backend required — hash is stored in localStorage.
 *
 * Security note: this is personal-use protection for local data.
 * It relies on browser localStorage isolation, which is appropriate given
 * no sensitive server-side data is involved.
 */

const HASH_KEY = 'wdip_auth_hash'
const SESSION_KEY = 'wdip_unlocked'

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** True if no password has been set yet (first run). */
export function isFirstRun(): boolean {
  return !localStorage.getItem(HASH_KEY)
}

/** True if the user has authenticated in this browser session. */
export function isUnlocked(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === '1'
}

/** Sets a new password (first-run flow). */
export async function setupPassword(password: string): Promise<void> {
  const hash = await sha256(password)
  localStorage.setItem(HASH_KEY, hash)
  sessionStorage.setItem(SESSION_KEY, '1')
}

/** Returns true if the provided password matches the stored hash. */
export async function login(password: string): Promise<boolean> {
  const stored = localStorage.getItem(HASH_KEY)
  if (!stored) return false
  const hash = await sha256(password)
  if (hash === stored) {
    sessionStorage.setItem(SESSION_KEY, '1')
    return true
  }
  return false
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY)
}
