<script setup lang="ts">
// The site shell. It reads content (SEO), so it is a layout: the platform preview page renders
// without a layout until its bundle arrives by message. ginko-i18n writes lang, canonical and hreflang.
const { otherLang } = useSite()
const path = useGinkoPath()
const seo = useGinko('seo')
const { alternates, t } = useI18n()

// The same page in the other language; ginko-i18n falls back to that language's home page.
const other = computed(() => alternates.value.find((a) => a.code === otherLang.value)!)

useSeoMeta({
  title: () => seo.value.data.title,
  description: () => seo.value.data.description,
  ogImage: () => seo.value.data.image?.url,
})

const nav = computed(() => [
  { key: 'lunch', href: path('lunch'), label: t('nav.lunch') },
  { key: 'menu', href: path('menu'), label: t('nav.menu') },
  { key: 'events', href: path('events'), label: t('nav.events') },
  { key: 'gallery', href: path('gallery'), label: t('nav.gallery') },
])
</script>

<template>
  <div class="shell">
  <a class="skip" href="#inhalt">{{ t('skip') }}</a>
  <header class="wrap site-header">
    <NuxtLink :to="path('home')" class="brand">
      <LindenLeaf class="brand-leaf" />
      <span>Gasthaus zur Linde</span>
    </NuxtLink>
    <NuxtLink :to="other.path" class="lang" :hreflang="other.language" :lang="other.language">{{ t('other') }}</NuxtLink>
    <nav class="nav" :aria-label="t('nav.main')">
      <NuxtLink v-for="item in nav" :key="item.key" :to="item.href" class="nav-link">{{ item.label }}</NuxtLink>
    </nav>
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
  grid-template-areas: 'brand lang' 'nav nav';
  align-items: center;
  column-gap: 16px;
  padding-top: 14px;
  border-bottom: 1px solid var(--rule);
}
.brand {
  grid-area: brand;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  justify-self: start;
  color: var(--ink);
  text-decoration: none;
  font-family: var(--serif);
  font-weight: 700;
  font-size: 1.3rem;
  letter-spacing: -0.01em;
}
.brand-leaf { width: 28px; height: 28px; color: var(--linde); }
.lang { grid-area: lang; font-weight: 500; padding: 8px 0; }
.nav {
  grid-area: nav;
  display: flex;
  flex-wrap: wrap;
  gap: 0 18px;
  padding-block: 6px 8px;
  font-size: 1.05rem;
}
.nav-link {
  color: var(--ink-2);
  text-decoration: none;
  font-weight: 500;
  padding: 6px 0;
  border-bottom: 2px solid transparent;
}
.nav-link:hover { color: var(--ink); }
.nav-link.router-link-exact-active,
.nav-link.router-link-active { color: var(--ink); border-bottom-color: var(--linde); }
@media (min-width: 900px) {
  .site-header {
    grid-template-columns: auto 1fr auto;
    grid-template-areas: 'brand nav lang';
    padding-block: 22px;
    border-bottom: 0;
  }
  .nav { justify-content: flex-end; gap: 28px; padding: 0 36px 0 0; }
}
</style>
