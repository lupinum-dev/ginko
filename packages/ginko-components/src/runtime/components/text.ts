// UI texts of the components. In a Nuxt app the plugin provides ginko-i18n's `useI18n('components')`, so the texts
// follow the page language and the host app can override each key. Without it (SSR tests, other hosts) the German
// defaults from `i18n/de.json` are used.
import { inject, type InjectionKey } from 'vue'
import de from '../../../i18n/de.json'

export type Translate = (key: string, params?: Record<string, string | number>) => string
export const TEXT_KEY: InjectionKey<() => Translate> = Symbol('ginko:components-text')

const fallback: Translate = (key, params) => {
  const text = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de)
  return typeof text === 'string' ? text.replace(/\{(\w+)\}/g, (m, name: string) => String(params?.[name] ?? m)) : key
}

/** Call in `setup`: returns `t('code.copy')`, `t('media.consent', { provider })`. */
export function useText(): Translate {
  return inject(TEXT_KEY, null)?.() ?? fallback
}
