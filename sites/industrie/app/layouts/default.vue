<script setup lang="ts">
// The site shell. It reads content (notices, job count), so it is a layout: the platform preview page
// renders without a layout until its bundle arrives by message. ginko-i18n writes lang, canonical and hreflang.
const { otherLang } = useSite()
const path = useGinkoPath()
const { alternates, t } = useI18n()
const jobs = useGinko('jobs')

// The same page in the other language; ginko-i18n falls back to that language's home page.
const other = computed(() => alternates.value.find((a) => a.code === otherLang.value)!)

const nav = computed(() => [
  { key: 'products', href: path('products'), label: t('nav.products') },
  { key: 'careers', href: path('careers'), label: t('nav.careers') },
  { key: 'news', href: path('news'), label: t('nav.news') },
  { key: 'events', href: path('events'), label: t('nav.events') },
  { key: 'contact', href: path('contact'), label: t('nav.contact') },
])
</script>

<template>
  <div class="shell">
    <a class="skip" href="#inhalt">{{ t('skip') }}</a>
    <div class="bar">
    <header class="wrap site-header">
      <NuxtLink :to="path('home')" class="brand">
        <span class="mark">BRUNNER</span>
        <span class="line">{{ t('brandLine') }}</span>
      </NuxtLink>
      <NuxtLink :to="other.path" class="lang" :hreflang="other.language" :lang="other.language">{{ t('other') }}</NuxtLink>
      <nav class="nav" :aria-label="t('mainNav')">
        <NuxtLink v-for="item in nav" :key="item.key" :to="item.href" class="nav-link">
          {{ item.label }}
          <template v-if="item.key === 'careers' && jobs.items.length">
            <span class="pill" aria-hidden="true">{{ jobs.items.length }}</span>
            <span class="sr">{{ t('openJobsCount', { n: jobs.items.length }) }}</span>
          </template>
        </NuxtLink>
      </nav>
    </header>
    </div>
    <NoticeStrip />
    <main id="inhalt">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.bar { border-bottom: 1px solid var(--rule); }
.site-header {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: 'brand lang' 'nav nav';
  align-items: center;
  column-gap: 16px;
  padding-top: 14px;
}
.brand { grid-area: brand; display: grid; justify-self: start; color: var(--ink); text-decoration: none; line-height: 1.2; }
.mark { font-weight: 700; letter-spacing: 0.12em; font-size: 1.25rem; }
.line { font-size: 13px; color: var(--ink-2); }
.lang { grid-area: lang; font-weight: 500; padding: 8px 0; }
.nav { grid-area: nav; display: flex; flex-wrap: wrap; gap: 0 20px; padding-block: 8px 0; }
/* Phones: two even rows instead of one item alone on the second line. */
@media (max-width: 899px) { .nav { display: grid; grid-template-columns: repeat(3, max-content); } }
.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-2);
  text-decoration: none;
  font-weight: 500;
  padding: 8px 0 6px;
  border-bottom: 3px solid transparent;
}
.nav-link:hover { color: var(--ink); }
.nav-link.router-link-active { color: var(--ink); border-bottom-color: var(--signal); }
@media (min-width: 900px) {
  .site-header { grid-template-columns: auto 1fr auto; grid-template-areas: 'brand nav lang'; padding-block: 20px 0; }
  .nav { justify-content: flex-end; gap: 0 28px; padding: 0 40px 0 0; align-self: end; }
}
</style>
