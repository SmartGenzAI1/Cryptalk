import { cookies } from 'next/headers'
import crypto from 'crypto'

const SESSION_SECRET = process.env.SESSION_SECRET || 'telegram-clone-secret-key-change-me'
const COOKIE_NAME = 'tc_session'

function verify(token: string): string | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
  if (crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
    return payload
  }
  return null
}

/** Lightweight cookie verification — no DB access (the Python backend handles all DB). */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const store = await cookies()
    const token = store.get(COOKIE_NAME)?.value
    if (!token) return null
    return verify(token)
  } catch {
    return null
  }
}
