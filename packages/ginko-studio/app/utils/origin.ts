// Which address of a site this platform links to: a local platform (development, tests) shows the
// local site from the site's preview origins, a hosted one the site's own URL.
const LOCAL = ['localhost', '127.0.0.1']

export function siteOrigin(site: { url: string; previewOrigins: readonly string[] }): string {
  const local = import.meta.client && LOCAL.includes(window.location.hostname)
  const pick = [site.url, ...site.previewOrigins].find((c) => LOCAL.includes(new URL(c).hostname) === local) ?? site.url
  return new URL(pick).origin
}
