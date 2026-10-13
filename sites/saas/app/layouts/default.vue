<script setup lang="ts">
// The site shell. It reads content (notices, hero button), so it is a layout: the platform preview
// page renders without a layout until its bundle arrives by message. ginko-i18n writes lang, canonical and hreflang.
import { siteName } from '../utils/site'

const { labels } = useSite()
const path = useGinkoPath()
const { t } = useI18n()
const hero = useGinko('hero')
const { alternates } = useI18n()

const nav = computed(() => [
  { key: 'features', href: `${path('home')}#funktionen`, label: labels.value.nav.features },
  { key: 'pricing', href: path('pricing'), label: labels.value.nav.pricing },
  { key: 'changelog', href: path('changelog'), label: labels.value.nav.changelog },
  { key: 'blog', href: path('blog'), label: labels.value.nav.blog },
  { key: 'faq', href: path('faq'), label: labels.value.nav.faq },
])
const cta = computed(() => ginkoSafeHref(hero.value.data.buttonUrl))
</script>

<template>
  <div class="shell">
    <a class="skip" href="#inhalt">{{ t('skip') }}</a>
    <NoticeBar />
    <header class="wrap site-header">
      <NuxtLink :to="path('home')" class="brand"><span class="mark" aria-hidden="true" />{{ siteName }}</NuxtLink>
      <nav class="nav" :aria-label="t('mainNav')">
        <NuxtLink v-for="item in nav" :key="item.key" :to="item.href" class="nav-link">{{ item.label }}</NuxtLink>
      </nav>
      <nav class="langs" :aria-label="t('langNav')">
        <template v-for="(a, i) in alternates" :key="a.code">
          <span v-if="i" aria-hidden="true">·</span>
          <NuxtLink :to="a.path" :hreflang="a.language" :lang="a.language" :aria-current="a.current ? 'page' : undefined" :class="{ current: a.current }">{{ a.code.toUpperCase() }}</NuxtLink>
        </template>
      </nav>
      <a v-if="cta" class="button cta" :href="cta" rel="noopener" :lang="ginkoLangOf(hero, 'buttonText')">{{ hero.data.buttonText }}</a>
    </header>
    <main id="inhalt">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.site-header {
  display: grid;
  grid-template-columns: 1fr auto;
  /* Phones: logo and languages, then the whole nav in one line. The hero carries the trial button. */
  grid-template-areas: 'brand langs' 'nav nav';
  align-items: center;
  gap: 4px 16px;
  padding-block: 12px;
}
.brand {
  grid-area: brand;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  justify-self: start;
  color: var(--ink);
  text-decoration: none;
  font-family: var(--head);
  font-weight: 800;
  font-stretch: 112%;
  font-variation-settings: 'wdth' 112;
  font-size: 1.45rem;
  letter-spacing: -0.01em;
}
.mark { width: 14px; height: 14px; background: var(--yellow); border: var(--line) solid var(--ink); border-radius: 2px; flex: none; }
.nav { grid-area: nav; display: flex; flex-wrap: wrap; gap: 0 14px; font-size: 0.95rem; }
.nav-link {
  color: var(--ink-2);
  text-decoration: none;
  font-weight: 500;
  padding: 10px 0;
  border-bottom: 3px solid transparent;
  line-height: 1.3;
}
.nav-link:hover { color: var(--ink); }
/* The features link is a jump on the home page (#funktionen), never the current page. */
.nav-link.router-link-exact-active:not([href*="#"]) { color: var(--ink); border-bottom-color: var(--yellow); }
.langs { grid-area: langs; display: flex; gap: 6px; align-items: center; color: var(--ink-2); font-size: 0.95rem; }
.langs a { color: var(--ink-2); text-decoration: none; padding: 10px 2px; }
.langs a:hover { color: var(--ink); text-decoration: underline; }
.langs a.current { color: var(--ink); font-weight: 700; }
.cta { grid-area: cta; justify-self: end; display: none; }
@media (min-width: 960px) {
  .site-header {
    grid-template-columns: auto 1fr auto auto;
    grid-template-areas: 'brand nav langs cta';
    gap: 0 28px;
    padding-block: 18px;
  }
  .nav { justify-content: center; gap: 0 26px; font-size: 1rem; }
  .cta { display: inline-flex; }
}
</style>
