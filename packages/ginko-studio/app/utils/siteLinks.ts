import type { Component, InjectionKey, Ref } from 'vue'

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

/** How many open screens carry their own bar at the bottom (the entry editor's save bar). The site layout provides it
 *  and hides the phone tab bar while it is above zero, whatever the route. */
export const OWN_BOTTOM_BAR: InjectionKey<Ref<number>> = Symbol('ownBottomBar')
