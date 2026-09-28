import { createHash, timingSafeEqual } from 'node:crypto'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hashMatches(value: string, hash: string): boolean {
  const candidate = Buffer.from(sha256Hex(value), 'hex')
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) {
    return false
  }
  return timingSafeEqual(candidate, expected)
}
