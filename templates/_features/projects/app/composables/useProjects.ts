import type { Card } from '~/components/block/Cards.vue'

/** The visible projects as cards (BlockCards): title, summary, photo, and for a campaign its last day. A campaign
 *  leaves the site after its `ends` day by itself. */
export function useProjectCards() {
  const projects = useGinko('projects')
  const locale = useGinkoLocale()
  const { t, format } = useI18n('projects')
  return computed<Card[]>(() => projects.value.items.map((project) => ({
    key: project.id,
    title: project.data.title,
    to: project.urls?.[locale.value] ?? '',
    text: project.data.summary,
    meta: project.data.ends ? t('until', { date: format.date(project.data.ends) }) : undefined,
    image: project.data.image,
  })))
}
