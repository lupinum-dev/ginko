/** The date text of an event, with its start time when one is stored: `16. Oktober, 19:00 Uhr` / `16 October, 7:00 pm`. */
export function useEventWhen() {
  const { t, format } = useI18n()
  const lang = useGinkoLocale()
  return (when: { from: string; to: string }, start?: string) => {
    const date = format.range(when.from, when.to)
    if (!start) return date
    // The clock time is shown as stored: the formatter gets it in UTC, so the site time zone does not shift it.
    const time = format.date(new Date(`${when.from}T${start}:00Z`), { hour: 'numeric', minute: '2-digit', hour12: lang.value !== 'de', timeZone: 'UTC' })
    return `${date}, ${t('eventTime', { time })}`
  }
}
