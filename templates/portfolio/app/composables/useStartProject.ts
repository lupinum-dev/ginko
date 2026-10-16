/**
 * "Start a project": an email to the studio (the address of content/site.md) with the subject already filled in, so
 * every enquiry arrives the same way. The site has no form (T13). Undefined when content/site.md has no email.
 */
export function useStartProject() {
  const site = useGinko('site')
  const { t } = useI18n()
  return computed(() => {
    const email = site.value.data.email
    return email ? `mailto:${email}?subject=${encodeURIComponent(t('start.subject'))}` : undefined
  })
}
