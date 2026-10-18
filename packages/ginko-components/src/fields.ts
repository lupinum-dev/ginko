// Registry fields that several tags share. Pure data, no Vue.
import { f } from '@lupinum/ginko'

/** Quiet (a border) or tint (a filled area). Without it the tag keeps the site's default; see "Appearance" in the README. */
export const appearance = f.choice({ de: 'Darstellung', en: 'Appearance' }, {
  options: [
    { value: 'quiet', label: { de: 'Ruhig (Rahmen)', en: 'Quiet (border)' } },
    { value: 'tint', label: { de: 'Getönt (Fläche)', en: 'Tint (filled)' } },
  ],
  optional: true,
})

/** Heading of a tag that has a `title` prop. */
export const title = f.text({ de: 'Titel', en: 'Title' }, { optional: true, max: 120 })

/** An Iconify name for tab, card, read-more and timeline-item (drawn by SiteIcon). */
export const iconifyIcon = f.text({ de: 'Symbol', en: 'Icon' }, { optional: true, max: 60, translate: false, hint: { de: 'Ein Iconify-Name, zum Beispiel lucide:book-open. Braucht eine globale Icon-Komponente (@nuxt/icon oder die Doku-Ebene).', en: 'An Iconify name, for example lucide:book-open. Needs a global Icon component (@nuxt/icon, or the ginko-docs layer).' } })

/** Callout symbol: a built-in name or an Iconify name (with a colon). Names are CALLOUT_ICON_NAMES in runtime/components/icons.ts. */
export const calloutIcon = f.text({ de: 'Symbol', en: 'Icon' }, { optional: true, max: 60, translate: false, hint: {
  de: 'Eingebaut: file-text, info, triangle-alert, circle-x, circle-check, lightbulb. Oder ein Iconify-Name wie lucide:flag (braucht eine globale Icon-Komponente: @nuxt/icon oder die Doku-Ebene). Ohne Angabe: das Symbol der Art.',
  en: 'Built in: file-text, info, triangle-alert, circle-x, circle-check, lightbulb. Or an Iconify name like lucide:flag (needs a global Icon component: @nuxt/icon or the ginko-docs layer). If empty: the icon of the type.',
} })
