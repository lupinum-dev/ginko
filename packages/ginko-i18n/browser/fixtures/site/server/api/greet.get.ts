import { defineEventHandler, getQuery } from 'nuxt/server'

export default defineEventHandler((event) => {
  const { t, locale } = getI18n(event)
  return { locale, text: t('api.greeting', { name: String(getQuery(event).name ?? '') }) }
})
