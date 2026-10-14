import { config } from '#ginko-i18n/config.mjs'
import { messages } from '#ginko-i18n/messages-server.mjs'
import { createFormatters, createTranslator } from '@lupinum/ginko-i18n/core'
import { typedTranslator, type ServerI18n } from '../types'

const c = config

/** Translator for the request's locale (set by the ginko-i18n middleware). Keys are relative to `namespace`. */
export function getI18n<NS extends string = ''>(event: { context: { locale?: unknown } }, namespace?: NS): ServerI18n<NS> {
  const requested = typeof event.context.locale === 'string' ? event.context.locale : undefined
  const code = requested ?? c.defaultLocale
  const locale = c.locales.find(l => l.code === code) ?? c.locales.find(l => l.code === c.defaultLocale)!
  const translator = createTranslator({
    messages: messages[locale.code],
    language: locale.language,
    params: c.params,
    timeZone: c.timeZone,
  })
  return {
    locale: locale.code,
    language: locale.language,
    ...typedTranslator(() => translator, namespace),
    format: createFormatters(locale.language, { timeZone: c.timeZone }),
  }
}
