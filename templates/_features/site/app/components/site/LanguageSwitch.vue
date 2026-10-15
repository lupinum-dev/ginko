<script setup lang="ts">
// The same page in each language of the site (ginko-i18n alternates). A page without a translation links to that
// language's home page and says so. Hidden when the site has one language.
const { t, alternates } = useI18n('site')
</script>

<template>
  <ul v-if="alternates.length > 1" class="flex items-center" :aria-label="t('language.label')">
    <li v-for="alt in alternates" :key="alt.code">
      <NuxtLink
        :to="alt.path"
        :hreflang="alt.language"
        :lang="alt.language"
        :aria-current="alt.current ? 'true' : undefined"
        :aria-label="alt.translated ? alt.name : t('language.untranslated', { language: alt.name })"
        class="inline-flex size-11 items-center justify-center rounded-md text-small font-medium text-muted-foreground uppercase transition-colors duration-150 hover:bg-accent hover:text-foreground aria-[current]:text-foreground aria-[current]:underline aria-[current]:underline-offset-4"
      >
        {{ alt.code }}
      </NuxtLink>
    </li>
  </ul>
</template>
