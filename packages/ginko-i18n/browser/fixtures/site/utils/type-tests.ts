// Compile-time checks for typed message keys. `nuxi typecheck` fails if an expectation breaks.
export function typeTests() {
  const { t } = useI18n()
  t('nav.home')
  t('home.cart', { count: 2 })
  // @ts-expect-error unknown key
  t('nav.nope')
  // @ts-expect-error `count` is required
  t('home.cart')
  // @ts-expect-error wrong parameter name
  t('home.cart', { amount: 2 })
  t('home.cta') // `tone` is a global param, so it is not required
  // @ts-expect-error a numeric parameter takes a number, not a string
  t('home.cart', { count: '3' })
  t('home.place', { n: 1 })
  // @ts-expect-error a selectordinal parameter takes a number
  t('home.place', { n: '1' })
  t('api.greeting', { name: 'Ada' })
  // @ts-expect-error missing `name`
  t('api.greeting')

  const lib = useI18n('fakeLib')
  lib.t('saved', { time: '12:00' })
  // @ts-expect-error keys are relative to the namespace
  lib.t('fakeLib.save')

  definePageMeta({ i18n: { paths: { de: '/x' } } })
  // @ts-expect-error `paths` must be an object
  definePageMeta({ i18n: { paths: '/x' } })
}
