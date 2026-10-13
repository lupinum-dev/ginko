// Which site addresses the platform may call. The platform's server fetches `site.url` with the
// site's refresh token ("Update website now"), so an address that reaches the platform's own network
// would turn that button into a request to internal services (SSRF).
//
// Limit: this checks the written host only. A public name that resolves to a private address
// (DNS rebinding) is not caught here; Convex actions cannot resolve names before fetching.

/** Dotted IPv4 (the URL parser already turns 0x7f.1, 2130706433 etc. into this form). */
function parseV4(host: string): number[] | undefined {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return undefined
  const parts = m.slice(1).map(Number)
  return parts.every((n) => n <= 255) ? parts : undefined
}

function privateV4([a, b, c]: number[]): boolean {
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a! >= 224 // multicast, reserved, broadcast
  )
}

/** The eight 16-bit groups of an IPv6 literal without brackets, or undefined when it is not one. */
function parseV6(host: string): number[] | undefined {
  if (!host.includes(':')) return undefined
  let text = host
  const tail = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (tail) {
    const v4 = parseV4(tail[1]!)
    if (!v4) return undefined
    text = text.slice(0, -tail[1]!.length) + ((v4[0]! << 8) | v4[1]!).toString(16) + ':' + ((v4[2]! << 8) | v4[3]!).toString(16)
  }
  const halves = text.split('::')
  if (halves.length > 2) return undefined
  const side = (s: string) => (s === '' ? [] : s.split(':'))
  const head = side(halves[0]!)
  const rest = halves.length === 2 ? side(halves[1]!) : []
  const fill = 8 - head.length - rest.length
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return undefined
  const groups = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill('0'), ...rest]
  const numbers = groups.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : Number.NaN))
  return numbers.length === 8 && numbers.every((n) => !Number.isNaN(n)) ? numbers : undefined
}

function privateV6(g: number[]): boolean {
  const embedded = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255]
  if (g.every((n) => n === 0) || (g.slice(0, 7).every((n) => n === 0) && g[7] === 1)) return true // :: and ::1
  if ((g[0]! & 0xffc0) === 0xfe80) return true // link-local fe80::/10
  if ((g[0]! & 0xfe00) === 0xfc00) return true // unique-local fc00::/7
  if ((g[0]! & 0xff00) === 0xff00) return true // multicast
  // IPv4 inside IPv6: judged by the IPv4 address. Mapped ::ffff:a.b.c.d, compatible ::a.b.c.d, NAT64 64:ff9b::/96, 6to4 2002:ab:cd::/16.
  if (g.slice(0, 5).every((n) => n === 0) && (g[5] === 0xffff || g[5] === 0)) return privateV4(embedded(g[6]!, g[7]!))
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0)) return privateV4(embedded(g[6]!, g[7]!))
  if (g[0] === 0x2002) return privateV4(embedded(g[1]!, g[2]!))
  return false
}

function loopbackHost(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1'
}

/**
 * True when the platform may send requests to this site address.
 * Only `https:` — plus `http:` for loopback hosts when `local` (a local dev deployment, GINKO_LOCAL=1).
 * Never an IP literal in a private, loopback, link-local, CGNAT, unique-local or reserved range,
 * and never `localhost`, `*.localhost`, `*.internal`, `*.local` (except those loopback hosts when `local`).
 */
export function isFetchableSiteUrl(value: string, local = false): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.username || url.password) return false
  // `[::1]` → `::1`; a trailing dot (`localhost.`) names the same host.
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!host) return false
  if (local && loopbackHost(host) && (url.protocol === 'http:' || url.protocol === 'https:')) return true
  if (url.protocol !== 'https:') return false
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false
  const v4 = parseV4(host)
  if (v4) return !privateV4(v4)
  if (host.includes(':')) {
    const v6 = parseV6(host)
    return v6 !== undefined && !privateV6(v6)
  }
  return true
}
