/**
 * AES-256-GCM encryption utility.
 * SERVER-SIDE ONLY — never import in client components.
 *
 * Format: base64( iv + ":" + authTag + ":" + ciphertext )
 * All three segments are individually base64-encoded before joining.
 *
 * Key:  NAVHUB_ENCRYPTION_KEY env var — 32-byte hex string (64 hex chars)
 *       Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32  // bytes

function getKey(): Buffer {
  const hex = process.env.NAVHUB_ENCRYPTION_KEY
  if (!hex || hex.length !== KEY_LENGTH * 2) {
    throw new Error(
      'NAVHUB_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64 string in the format: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv  = randomBytes(12)  // 96-bit IV recommended for GCM

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

/**
 * Decrypts a base64 string produced by encrypt().
 * Throws if the key is wrong or the ciphertext has been tampered with.
 */
export function decrypt(encrypted: string): string {
  const key    = getKey()
  const parts  = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format — expected iv:authTag:ciphertext')
  }

  const [ivB64, tagB64, dataB64] = parts
  const iv      = Buffer.from(ivB64,  'base64')
  const authTag = Buffer.from(tagB64, 'base64')
  const data    = Buffer.from(dataB64, 'base64')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
