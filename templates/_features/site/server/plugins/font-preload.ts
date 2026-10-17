import { useServerHooks } from 'nuxt/server'

// Preloads the basic Latin file of each web font (@nuxt/fonts writes its @font-face rules into the page's head), so
// the browser fetches it with the page instead of after the stylesheet and the scripts. Text set in the fallback
// re-wraps when the font arrives late, and a heading that gains a line pushes the page down (layout shift). @nuxt/fonts'
// own `preload` option puts the file into the build manifest, but the server renders no link for it.
const FACE = /@font-face\s*\{[^}]*\}/g
const LATIN = /unicode-range:\s*U\+(?:\?\?|0-FF)(?=[,;}])/i
const WOFF2 = /url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/

export default () => {
  useServerHooks().hook('render:html', (html) => {
    const urls = new Set((html.head.join('').match(FACE) ?? []).filter((face) => LATIN.test(face)).flatMap((face) => WOFF2.exec(face)?.[1] ?? []))
    if (urls.size) html.head.unshift([...urls].map((url) => `<link rel="preload" as="font" type="font/woff2" href="${url}" crossorigin>`).join(''))
  })
}
