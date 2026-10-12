// Compile-time checks for the server translator. `nuxi typecheck` fails if an expectation breaks.
export function serverTypeTests(event: { context: { locale?: unknown } }) {
  getI18n(event).t('nav.home')
  getI18n(event).t('home.cart', { count: 2 })
  // @ts-expect-error unknown key
  getI18n(event).t('nav.nope')
  // @ts-expect-error a numeric parameter takes a number, not a string
  getI18n(event).t('home.cart', { count: '3' })
  // @ts-expect-error missing `name`
  getI18n(event).t('api.greeting')
}
