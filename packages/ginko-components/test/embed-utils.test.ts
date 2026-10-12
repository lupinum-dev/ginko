import { describe, expect, test } from 'vitest'
import { matchEmbed, mergeProviders, type EmbedProviderConfig } from '../src/runtime/components/embed-utils.ts'

const mine = { name: 'Mine', pattern: '^https://media\\.example\\.org/v/(\\w+)$', embed: 'https://media.example.org/embed/$1', ratio: '21 / 9' }
const url = (src: string, config?: EmbedProviderConfig) => {
  const s = matchEmbed(src, mergeProviders(config))
  return s?.kind === 'embed' ? s.url : s
}

describe('matchEmbed', () => {
  test.each<[string, string, EmbedProviderConfig | undefined, unknown]>([
    ['google maps', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1d2428.9!2d13.4!3d52.5!5e0', undefined, 'https://www.google.com/maps/embed?pb=!1m18!1m12!1d2428.9!2d13.4!3d52.5!5e0'],
    ['openstreetmap', 'https://www.openstreetmap.org/export/embed.html?bbox=13.3%2C52.5%2C13.5%2C52.6&layer=mapnik&marker=52.5%2C13.4', undefined, 'https://www.openstreetmap.org/export/embed.html?bbox=13.3%2C52.5%2C13.5%2C52.6&layer=mapnik&marker=52.5%2C13.4'],
    ['spotify track (compact)', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc', undefined, 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'],
    ['spotify playlist with locale prefix', 'https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M', undefined, 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M'],
    ['calendly', 'https://calendly.com/jane-doe/30min', undefined, 'https://calendly.com/jane-doe/30min'],
    ['lookalike host', 'https://www.google.com.evil.example/maps/embed?pb=x', undefined, { kind: 'link', url: 'https://www.google.com.evil.example/maps/embed?pb=x' }],
    ['host smuggled into the query', 'https://evil.example/?https://open.spotify.com/track/abc', undefined, { kind: 'link', url: 'https://evil.example/?https://open.spotify.com/track/abc' }],
    ['plain http is never framed', 'http://open.spotify.com/track/abc', undefined, { kind: 'link', url: 'http://open.spotify.com/track/abc' }],
    ['javascript url', 'javascript:alert(1)', undefined, undefined],
    ['data url', 'data:text/html,<script>alert(1)</script>', undefined, undefined],
    ['site path', '/maps', undefined, undefined],
    ['a provider from config', 'https://media.example.org/v/abc123', { mine }, 'https://media.example.org/embed/abc123'],
    ['config replaces a built-in', 'https://calendly.com/jane-doe', { calendly: { ...mine, pattern: '^https://calendly\\.com/(\\w[\\w-]*)$', embed: 'https://calendly.com/embed-copy/$1' } }, 'https://calendly.com/embed-copy/jane-doe'],
    ['a disabled built-in is a link', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', { spotify: false }, { kind: 'link', url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' }],
  ])('%s', (_name, src, config, expected) => {
    expect(url(src, config)).toEqual(expected)
  })

  test('the matched provider carries its size and permissions', () => {
    expect(matchEmbed('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')).toMatchObject({ kind: 'embed', name: 'Spotify', height: 152 })
    expect(matchEmbed('https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC')).toMatchObject({ height: 352 })
    expect(matchEmbed('https://media.example.org/v/a', mergeProviders({ mine }))).toMatchObject({ ratio: '21/9', allow: '' })
  })

  test.each<[string, unknown, string]>([
    ['pattern without ^https://', { ...mine, pattern: 'media\\.example\\.org' }, 'embeds.providers.bad: „pattern“ muss mit ^https:// beginnen / "pattern" must start with ^https://'],
    ['pattern that does not compile', { ...mine, pattern: '^https://(' }, 'embeds.providers.bad: „pattern“ ist kein gültiger regulärer Ausdruck'],
    ['embed with http', { ...mine, embed: 'http://x.example/$1' }, 'embeds.providers.bad: „embed“ muss mit https:// beginnen'],
    ['empty name', { ...mine, name: ' ' }, 'embeds.providers.bad: „name“ darf nicht leer sein'],
    ['a string instead of an object', 'nope', 'embeds.providers.bad: erwartet ein Objekt oder false'],
  ])('invalid config: %s', (_name, provider, message) => {
    expect(() => mergeProviders({ bad: provider as never })).toThrow(message)
  })
})
