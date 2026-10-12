<script setup lang="ts">
const { t, locale, localePath, alternates } = useI18n()
// A content link comes from content data (D6), here a stand-in for a localized list item.
const featured = computed(() => (locale.value === 'en' ? 'hello-world' : 'hallo-welt'))
const suggestion = useLocaleSuggestion()
</script>

<template>
  <div>
    <header>
      <nav data-test="nav">
        <NuxtLink
          data-test="nav-home"
          :to="localePath('/')"
        >{{ t('nav.home') }}</NuxtLink> ·
        <NuxtLink
          data-test="nav-about"
          :to="localePath('/about')"
        >{{ t('nav.about') }}</NuxtLink> ·
        <NuxtLink
          data-test="nav-blog"
          :to="localePath(`/blog/${featured}`)"
        >{{ t('nav.blog') }}</NuxtLink> ·
        <NuxtLink
          data-test="nav-only-de"
          :to="localePath('/nur-deutsch')"
        >{{ t('nav.onlyDe') }}</NuxtLink>
      </nav>
      <nav data-test="switcher">
        <NuxtLink
          v-for="a in alternates"
          :key="a.code"
          :data-test="`switch-${a.code}`"
          :to="a.path"
          :hreflang="a.language"
          :aria-current="a.current ? 'page' : undefined"
          :data-translated="a.translated"
        >{{ a.name }}</NuxtLink>
      </nav>
      <p
        v-if="suggestion"
        data-test="suggestion"
      >
        <NuxtLink :to="suggestion.path">{{ t('suggest', { name: suggestion.name }) }}</NuxtLink>
      </p>
    </header>
    <main><slot /></main>
  </div>
</template>
