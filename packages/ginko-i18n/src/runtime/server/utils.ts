import { config } from '#ginko-i18n/config.mjs'
import { messages } from '#ginko-i18n/messages-server.mjs'
import { createFormatters, createTranslator, type Translator } from '@lupinum/ginko-i18n/core'
import type { TypedTranslator } from '../types'

const c = config

/** Translator for the request's locale (set by the ginko-i18n middleware). */
export function getI18n(event: { context: { locale?: unknown } }): { locale: string, language: string, format: ReturnType<typeof createFormatters> } & TypedTranslator {
  const requested = typeof event.context.locale === 'string' ? event.context.locale : undefined
  const code = requested ?? c.defaultLocale
  const locale = c.locales.find(l => l.code === code) ?? c.locales.find(l => l.code === c.defaultLocale)!
  const translator: Translator = createTranslator({
    messages: messages[locale.code],
    language: locale.language,
    params: c.params,
    timeZone: c.timeZone,
  })
  return { locale: locale.code, language: locale.language, ...translator, format: createFormatters(locale.language, { timeZone: c.timeZone }) }
}
