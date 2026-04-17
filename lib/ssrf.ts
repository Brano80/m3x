import dns from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { isIPv4, isIPv6 } from 'node:net'

/** True if this IPv4 address must not be used for outbound webhooks (SSRF). */
function isUnsafeIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return true
  const o = parts.map((p) => parseInt(p, 10))
  if (o.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true
  const [a, b] = o
  if (a === 0 && o[1] === 0 && o[2] === 0 && o[3] === 0) return true
  if (a === 127) return true // 127.0.0.0/8
  if (a === 10) return true // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 169 && b === 254) return true // 169.254.0.0/16
  return false
}

function ipv6FirstHextet(addr: string): number {
  const s = addr.split('%')[0].toLowerCase()
  if (s === '::' || s.startsWith('::')) return 0
  const head = s.includes('::') ? s.split('::')[0]! : s
  const firstSeg = head.split(':')[0]
  if (!firstSeg) return 0
  return parseInt(firstSeg, 16)
}

/** True if this IPv6 address must not be used for outbound webhooks (SSRF). */
function isUnsafeIPv6(ip: string): boolean {
  const s = ip.split('%')[0].toLowerCase()
  if (s === '::1') return true
  const mapped = s.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isUnsafeIPv4(mapped[1]!)
  const first = ipv6FirstHextet(s)
  if (!Number.isFinite(first)) return true
  // fc00::/7 — IPv6 unique local (private)
  if (first >= 0xfc00 && first <= 0xfdff) return true
  return false
}

function isBlockedResolvedIp(address: string): boolean {
  if (isIPv4(address)) return isUnsafeIPv4(address)
  if (isIPv6(address)) return isUnsafeIPv6(address)
  return true
}

/**
 * Returns true only if the URL is https, parses, hostname is not blocked by name,
 * and every DNS-resolved address is outside private/internal ranges.
 */
export async function isSafeWebhookUrl(url: string): Promise<boolean> {
  if (!url.startsWith('https://')) return false

  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }

  if (hostname.toLowerCase() === 'localhost' || hostname === '0.0.0.0') {
    return false
  }

  let results: LookupAddress[]
  try {
    results = await dns.lookup(hostname, { all: true })
  } catch {
    return false
  }

  if (!results.length) return false

  for (const { address } of results) {
    if (isBlockedResolvedIp(address)) return false
  }

  return true
}
