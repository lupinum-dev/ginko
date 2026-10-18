import type { Card } from '~/components/block/Cards.vue'

/** The visible projects as cards (BlockCards): title, summary, photo, and for a campaign its last day. A campaign
 *  leaves the site after its `ends` day by itself. */
export function useProjectCards() {
  const projects = useGinko('projects')
  const locale = useGinkoLocale()
  const { t, format } = useI18n('projects')
  return computed<Card[]>(() => projects.value.items.map((project) => {
    const { ends } = projectCampaign(project.data)
    return {
      key: project.id,
      title: project.data.title,
      to: project.urls?.[locale.value] ?? '',
      text: project.data.summary,
      meta: ends ? t('until', { date: format.date(ends) }) : undefined,
      image: project.data.image,
    }
  }))
}

/** A campaign's last day and button. The brick of `projects({ details: true })` has neither field, so they are read
 *  only where the template's brick has them. */
export function projectCampaign(data: object) {
  return {
    ends: 'ends' in data && typeof data.ends === 'string' ? data.ends : undefined,
    actionLabel: 'actionLabel' in data && typeof data.actionLabel === 'string' ? data.actionLabel : undefined,
    actionUrl: 'actionUrl' in data && typeof data.actionUrl === 'string' ? data.actionUrl : undefined,
  }
}
