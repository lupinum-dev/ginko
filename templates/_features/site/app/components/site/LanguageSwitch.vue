<script setup lang="ts">
// The same page in each language of the site (ginko-i18n alternates). A page without a translation links to that
// language's home page and says so. Hidden when the site has one language. The visible code starts the accessible
// name ("de Deutsch"), so voice control users can say what they see (WCAG 2.5.3).
const { t, alternates, language } = useI18n('site')
</script>

<template>
  <ul v-if="alternates.length > 1" class="flex items-center" :aria-label="t('language.label')">
    <li v-for="alt in alternates" :key="alt.code">
      <NuxtLink
        :to="alt.path"
        :hreflang="alt.language"
        :lang="alt.language"
        :aria-current="alt.current ? 'true' : undefined"
        class="inline-flex size-11 items-center justify-center rounded-md text-small font-medium text-muted-foreground uppercase transition-colors duration-150 hover:bg-accent hover:text-foreground aria-[current]:text-foreground aria-[current]:underline aria-[current]:underline-offset-4"
      >
        {{ alt.code }}<span class="sr-only normal-case">&nbsp;<template v-if="alt.translated">{{ alt.name }}</template><span v-else :lang="language">{{ t('language.untranslated', { language: alt.name }) }}</span></span>
      </NuxtLink>
    </li>
  </ul>
</template>
