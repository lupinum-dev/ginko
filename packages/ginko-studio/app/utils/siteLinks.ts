import type { Component } from 'vue'

/** One view of a site in the rail and the phone tab bar. */
export interface SiteLink {
  to: string
  /** Full name, as the page calls itself ("Schnell ändern"). */
  label: string
  /** Name under the icon in the rail and the tab bar ("Heute"). */
  short: string
  icon: Component
  /** Only the exact path counts as this view (the site's start page; every other view owns its sub-paths). */
  exact?: boolean
  /** A number on the icon, e.g. changes waiting for review. */
  count?: number
}

export const isSiteLinkActive = (path: string, link: SiteLink) =>
  link.exact ? path.replace(/\/$/, '') === link.to : path === link.to || path.startsWith(`${link.to}/`)
