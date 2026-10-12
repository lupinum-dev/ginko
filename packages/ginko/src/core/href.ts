/** http(s), mailto, tel, a same-site path or fragment, or a `$` route link. Everything else (javascript:, data:, //host) is unsafe. */
export function isSafeHref(href: string): boolean {
  // Browsers strip tabs/newlines and treat `\` like `/`, so `/\t/evil.example` would leave the site.
  if (typeof href !== 'string' || href.length > 2000 || /[\u0000- \u007f\\]/.test(href)) return false
  if (href.startsWith('#')) return true
  // Route links to entries and pages (`$blog.my-post#intro`, `$page.menu`); resolveRouteLinks turns them into paths.
  if (href.startsWith('$')) return /^\$[A-Za-z0-9._-]+(#[A-Za-z0-9._-]*)?$/.test(href)
  if (href.startsWith('/')) return !href.startsWith('//') && !href.startsWith('/\\')
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:\+?[0-9 ()/-]+)$/i.test(href)
}

/** The link or image URL when it is safe (see `isSafeHref`), else undefined: for `href`/`src` from content. */
export function safeHref(href: string | undefined): string | undefined {
  return href !== undefined && isSafeHref(href) ? href : undefined
}
