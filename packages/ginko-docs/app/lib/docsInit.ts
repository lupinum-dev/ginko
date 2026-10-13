// Storage keys and the head scripts of the color-mode switch and the banner. Each component adds its own script
// (useHead with a fixed key, so two toggles on one page add it once), so they also work inside a site's own layout.
export const COLOR_KEY = 'docs-color-mode'
export const bannerKey = (id: string) => `docs-banner:${id}`

// Runs inline in <head>, before first paint. localStorage can throw (private windows, blocked site data); then the
// page simply follows the system and shows the banner.
const guarded = (body: string) => `(function(){try{var d=document.documentElement;${body}}catch(e){}})()`

/** Applies the stored light/dark choice (html[data-theme]) before first paint. */
export function colorInitScript(): string {
  return guarded(`var m=localStorage.getItem(${JSON.stringify(COLOR_KEY)});if(m==='light'||m==='dark')d.setAttribute('data-theme',m);`)
}

/** Marks a dismissed banner (html[data-docs-banner-off]) before first paint, so it does not flash. */
export function bannerInitScript(id: string): string {
  return guarded(`if(localStorage.getItem(${JSON.stringify(bannerKey(id))})==='1')d.setAttribute('data-docs-banner-off','');`)
}
