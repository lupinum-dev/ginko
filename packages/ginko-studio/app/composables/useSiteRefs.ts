// The ref fields of a form on one site: each reads the titles of its own target brick (entries.titles) while it is
// shown, so an editor no longer needs every entry of the site.
import { api } from '#convex/api'
import type { Locale } from '@lupinum/ginko'
import type { Schema } from '@lupinum/ginko/internal'
import { provideRefs } from '../components/fields/refs'
import { shownLabel } from '../utils/labels'

export function provideSiteRefs(site: () => string, schema: () => Schema, main: () => Locale): void {
  const { locale } = useI18n()
  const label = (brick: string) => {
    const text = schema().bricks[brick]?.label
    return text === undefined ? brick : shownLabel(text, main())
  }
  provideRefs({
    options: (brick) => {
      const { data } = useConvexQuery(api.entries.titles, () => (schema().bricks[brick()] ? { site: site(), brick: brick(), language: locale.value } : 'skip'))
      return computed(() => (data.value ?? []).filter((e) => e.state !== 'draft').map((e) => ({ id: e._id, title: e.title ?? label(brick()) })))
    },
    brickLabel: label,
  })
}
