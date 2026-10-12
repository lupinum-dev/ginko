// Pure provider matching of the `embedded` component (the tag `embed` stays blocked: without a registry it would
// render the native element). A provider is plain serializable data (so it can travel through
// `runtimeConfig.public`); only `https:` URLs of known providers ever become an iframe. Everything else is a link,
// and `javascript:`, `data:` and similar addresses are rejected (`undefined`).
import type { InjectionKey } from 'vue'

export interface EmbedProvider {
  /** Shown to the visitor in the consent line, e.g. "Spotify". */
  name: string
  /** Regex source, tested against the whole address. Must start with `^https://`. */
  pattern: string
  /** Replacement for `String.replace`, with `$1`.. groups. Must start with `https://`. */
  embed: string
  /** CSS aspect ratio such as `16/9` (default). Ignored when `height` is set. */
  ratio?: string
  /** Fixed iframe height in px instead of a ratio. */
  height?: number
  /** Value of the iframe `allow` attribute (default none). */
  allow?: string
}

/** A provider with its id, in match order. This is what reaches the runtime. */
export type EmbedProviderEntry = EmbedProvider & { id: string }

export type EmbedProviderConfig = Record<string, EmbedProvider | false>

export type EmbedSource =
  | { kind: 'embed'; id: string; name: string; url: string; ratio: string; height?: number; allow: string }
  | { kind: 'link'; url: string }

export const EMBED_PROVIDERS_KEY: InjectionKey<readonly EmbedProviderEntry[]> = Symbol('ginko:embed-providers')

const SPOTIFY_ALLOW = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'

// Each embed URL format was checked against the provider's own docs (see the comment per entry). Keys are ids that a
// site can replace or disable with `false`.
export const BUILTIN_EMBED_PROVIDERS: Record<string, EmbedProvider> = {
  // The URL Google Maps gives under "Share → Embed a map → Copy HTML" (src of the iframe), used as it is.
  // https://support.google.com/maps/answer/144361 names the dialog; the keyless `pb=` form is what it generates.
  // (The keyed Maps Embed API, https://developers.google.com/maps/documentation/embed, is a different form and not supported.)
  'google-maps': {
    name: 'Google Maps',
    pattern: '^(https://www\\.google\\.com/maps/embed\\?pb=[^\\s"\'<>]+)$',
    embed: '$1',
    ratio: '4/3',
  },
  // "Share → HTML" on openstreetmap.org/export gives an iframe with exactly this URL.
  // https://wiki.openstreetmap.org/wiki/Export#Embeddable_HTML
  'openstreetmap': {
    name: 'OpenStreetMap',
    pattern: '^(https://www\\.openstreetmap\\.org/export/embed\\.html\\?[^\\s"\'<>]+)$',
    embed: '$1',
    ratio: '4/3',
  },
  // Page URL → https://open.spotify.com/embed/{type}/{id}.
  // https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed
  // Compact player (track, episode) is 152 px high, the large one 352 px; one entry per height.
  'spotify': {
    name: 'Spotify',
    pattern: '^https://open\\.spotify\\.com/(?:intl-[a-z]{2}/)?(track|episode)/([\\w-]+)(?:\\?[^\\s"\'<>]*)?$',
    embed: 'https://open.spotify.com/embed/$1/$2',
    height: 152,
    allow: SPOTIFY_ALLOW,
  },
  'spotify-list': {
    name: 'Spotify',
    pattern: '^https://open\\.spotify\\.com/(?:intl-[a-z]{2}/)?(album|playlist|show)/([\\w-]+)(?:\\?[^\\s"\'<>]*)?$',
    embed: 'https://open.spotify.com/embed/$1/$2',
    height: 352,
    allow: SPOTIFY_ALLOW,
  },
  // Calendly's iframe guide embeds the scheduling link itself: <iframe src="https://calendly.com/YOUR_SCHEDULING_LINK">.
  // https://calendly.com/help/how-to-embed-calendly-with-an-iframe
  // Not added: `embed_type=Inline&embed_domain=...`; only widget.js needs it (resize, events) and the iframe guide does not list it.
  'calendly': {
    name: 'Calendly',
    pattern: '^(https://calendly\\.com/[\\w.-]+(?:/[\\w.-]+)?)/?(?:\\?[^\\s"\'<>]*)?$',
    embed: '$1',
    height: 700,
  },
}

const fail = (id: string, de: string, en: string) => new Error(`[ginko-components] embeds.providers.${id}: ${de} / ${en}`)

/** Checks one provider; throws a German/English error that names the id. */
export function assertProvider(id: string, p: unknown): asserts p is EmbedProvider {
  if (!p || typeof p !== 'object') throw fail(id, 'erwartet ein Objekt oder false', 'expected an object or false')
  const { name, pattern, embed, ratio, height, allow } = p as Record<string, unknown>
  if (typeof name !== 'string' || !name.trim()) throw fail(id, '„name“ darf nicht leer sein', '"name" must not be empty')
  if (typeof pattern !== 'string' || !pattern.startsWith('^https://'))
    throw fail(id, '„pattern“ muss mit ^https:// beginnen', '"pattern" must start with ^https://')
  try { new RegExp(pattern) } catch { throw fail(id, '„pattern“ ist kein gültiger regulärer Ausdruck', '"pattern" is not a valid regular expression') }
  if (typeof embed !== 'string' || !embed.startsWith('https://'))
    throw fail(id, '„embed“ muss mit https:// beginnen', '"embed" must start with https://')
  if (ratio !== undefined && (typeof ratio !== 'string' || !/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(ratio)))
    throw fail(id, '„ratio“ muss wie 16/9 aussehen', '"ratio" must look like 16/9')
  if (height !== undefined && (typeof height !== 'number' || !Number.isInteger(height) || height < 1 || height > 4000))
    throw fail(id, '„height“ muss eine ganze Zahl in Pixeln sein', '"height" must be a whole number of pixels')
  if (allow !== undefined && typeof allow !== 'string') throw fail(id, '„allow“ muss ein Text sein', '"allow" must be a string')
}

/** Built-ins plus the site's config, in order (a replaced built-in keeps its place). Validates the config. */
export function mergeProviders(config: EmbedProviderConfig = {}): EmbedProviderEntry[] {
  const merged: Record<string, EmbedProvider | false> = { ...BUILTIN_EMBED_PROVIDERS }
  for (const [id, entry] of Object.entries(config)) {
    if (entry !== false) assertProvider(id, entry)
    merged[id] = entry
  }
  return Object.entries(merged).flatMap(([id, p]) => (p === false ? [] : [{ id, ...p }]))
}

/** The first provider whose pattern matches `src` gives the iframe address; any other http(s) address is a link. */
export function matchEmbed(src: string, providers: readonly EmbedProviderEntry[] = mergeProviders()): EmbedSource | undefined {
  const raw = src.trim()
  let url: URL
  try { url = new URL(raw) } catch { return undefined }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  for (const p of providers) {
    let re: RegExp
    try { re = new RegExp(p.pattern) } catch { continue }
    if (!re.test(raw)) continue
    let framed: URL
    try { framed = new URL(raw.replace(re, p.embed)) } catch { continue }
    if (framed.protocol !== 'https:') continue
    return { kind: 'embed', id: p.id, name: p.name, url: framed.href, ratio: (p.ratio ?? '16/9').replace(/\s/g, ''), height: p.height, allow: p.allow ?? '' }
  }
  return { kind: 'link', url: url.href }
}
