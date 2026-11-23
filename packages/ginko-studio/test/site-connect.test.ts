// @vitest-environment happy-dom
// "Connect the website": the three steps that bring a new site's areas into the Studio. The German catalog is the real
// one; Nuxt's auto-imports become globals.
import { mount } from '@vue/test-utils'
import { computed } from 'vue'
import { expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import SiteConnect from '../app/components/SiteConnect.vue'

vi.stubGlobal('computed', computed)
vi.stubGlobal('useI18n', useI18n)
vi.stubGlobal('useRequestURL', () => new URL('https://studio.example.org/s/linde/all'))

// Wrong behaviour caught: the release command names the Convex backend address, which a person cannot read off any
// screen and which changes with the deployment, instead of the Studio's own address that the CLI resolves.
test('the release command names this Studio address and the site identifier', () => {
  const wrapper = mount(SiteConnect, { props: { slug: 'linde' }, global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } })
  const blocks = wrapper.findAll('pre').map((pre) => pre.text())
  expect(blocks).toEqual([
    "site: 'linde',",
    'GINKO_PLATFORM=https://studio.example.org GINKO_KEY=… GINKO_COMMIT=$(git rev-parse HEAD) npx ginko release',
  ])
  wrapper.unmount()
})
