// AES-256-GCM encryption for BYOK API keys
// Set BYOK_ENCRYPTION_KEY in Vercel (long random secret, e.g. openssl rand -hex 32).
// If unset, isByokConfigured() is false and registration with api_key returns BYOK_NOT_ENABLED.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16
const SALT = 'm3x-byok-v1' // static salt — key is already high entropy

function getDerivedKey(): Buffer {
  const raw = process.env.BYOK_ENCRYPTION_KEY
  if (!raw) throw new Error('BYOK_ENCRYPTION_KEY env var not set')
  return scryptSync(raw, SALT, 32)
}

export function encryptKey(plaintext: string): string {
  const key = getDerivedKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:encrypted (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptKey(encoded: string): string {
  const key = getDerivedKey()
  const [ivHex, tagHex, encHex] = encoded.split(':')
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid encrypted key format')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

export function isByokConfigured(): boolean {
  return !!process.env.BYOK_ENCRYPTION_KEY
}
