// AES-256-GCM encryption for BYOK API keys
// Set BYOK_ENCRYPTION_KEY in Vercel (long random secret, e.g. openssl rand -hex 32).
// If unset, isByokConfigured() is false and registration with api_key returns BYOK_NOT_ENABLED.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

function getRawKeyMaterial(): string {
  const raw = process.env.BYOK_ENCRYPTION_KEY
  if (!raw) throw new Error('BYOK_ENCRYPTION_KEY env var not set')
  return raw
}

export function encryptKey(plaintext: string): string {
  const raw = getRawKeyMaterial()
  const iv = randomBytes(IV_LENGTH)
  const salt = randomBytes(16)
  const key = scryptSync(raw, salt, 32)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${salt.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptKey(encoded: string): string {
  const raw = getRawKeyMaterial()
  const parts = encoded.split(':')

  if (parts.length === 3) {
    // legacy format — static salt
    const [ivHex, tagHex, encHex] = parts
    if (!ivHex || !tagHex || !encHex) throw new Error('Invalid encrypted key format')
    const key = scryptSync(raw, 'm3x-byok-v1', 32)
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const encrypted = Buffer.from(encHex, 'hex')
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted) + decipher.final('utf8')
  }

  if (parts.length === 4) {
    const [ivHex, saltHex, tagHex, encHex] = parts
    if (!ivHex || !saltHex || !tagHex || !encHex) throw new Error('Invalid encrypted key format')
    const salt = Buffer.from(saltHex, 'hex')
    const key = scryptSync(raw, salt, 32)
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const encrypted = Buffer.from(encHex, 'hex')
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted) + decipher.final('utf8')
  }

  throw new Error('Invalid encrypted key format')
}

export function isByokConfigured(): boolean {
  return !!process.env.BYOK_ENCRYPTION_KEY
}
