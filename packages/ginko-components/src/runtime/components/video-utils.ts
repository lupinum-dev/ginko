// Pure URL parsing of the `video` component. Only http(s) URLs (and site-relative paths for files) are accepted;
// anything else (`javascript:`, `data:`, ...) gives `undefined`, so it can never reach an iframe or a link.

export type VideoSource =
  | { kind: 'youtube'; id: string; start?: number }
  | { kind: 'vimeo'; id: string; hash?: string; start?: number }
  | { kind: 'file'; url: string }
  | { kind: 'link'; url: string }

const YOUTUBE_ID = /^[\w-]{11}$/
const VIMEO_ID = /^\d{5,12}$/
const FILE = /\.(?:mp4|webm)$/i

/** `90`, `90s`, `1m30s`, `1h2m3s` → seconds. */
function seconds(raw: string | null): number | undefined {
  if (!raw) return undefined
  if (/^\d+$/.test(raw)) return Number(raw)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw)
  if (!m || !(m[1] || m[2] || m[3])) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** `start` is the component's own prop in seconds; it wins over a time in the URL. */
export function parseVideoUrl(src: string, start?: number): VideoSource | undefined {
  const raw = src.trim()
  // A file on the same site, e.g. /media/film.mp4 (not //host).
  if (/^\/(?!\/)/.test(raw)) return FILE.test(raw.split(/[?#]/)[0]!) ? { kind: 'file', url: raw } : undefined
  let url: URL
  try { url = new URL(raw) } catch { return undefined }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  const host = url.hostname.toLowerCase().replace(/^(?:www|m)\./, '')
  const parts = url.pathname.split('/').filter(Boolean)
  const from = Number.isFinite(start) && start! > 0 ? Math.floor(start!) : undefined

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = host === 'youtu.be' ? parts[0]
      : parts[0] === 'watch' ? (url.searchParams.get('v') ?? undefined)
        : ['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '') ? parts[1] : undefined
    if (!id || !YOUTUBE_ID.test(id)) return { kind: 'link', url: url.href }
    return { kind: 'youtube', id, start: from ?? seconds(url.searchParams.get('t') ?? url.searchParams.get('start')) }
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    // vimeo.com/123456789, vimeo.com/123456789/<hash> (unlisted), vimeo.com/channels/x/123456789, player.vimeo.com/video/123456789
    const index = parts.findIndex((p) => VIMEO_ID.test(p))
    if (index < 0) return { kind: 'link', url: url.href }
    const hash = url.searchParams.get('h') ?? (/^[0-9a-f]{8,}$/i.test(parts[index + 1] ?? '') ? parts[index + 1] : undefined)
    return { kind: 'vimeo', id: parts[index]!, hash, start: from ?? seconds(/^#t=(.+)$/.exec(url.hash)?.[1] ?? null) }
  }

  if (FILE.test(url.pathname)) return { kind: 'file', url: url.href }
  return { kind: 'link', url: url.href }
}

/** The iframe address of a provider video. Autoplay is safe: it is only built after the visitor clicked. */
export function embedUrl(source: Extract<VideoSource, { kind: 'youtube' | 'vimeo' }>): string {
  if (source.kind === 'youtube')
    return `https://www.youtube-nocookie.com/embed/${source.id}?autoplay=1${source.start ? `&start=${source.start}` : ''}`
  return `https://player.vimeo.com/video/${source.id}?autoplay=1&dnt=1${source.hash ? `&h=${source.hash}` : ''}${source.start ? `#t=${source.start}s` : ''}`
}
