<!-- Synced from templates/_features/site/app/components/site/LanguageSwitch.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// The same page in each language of the site (ginko-i18n alternates). A page without a translation links to that
// language's home page and says so. Hidden when the site has one language. Two forms: codes in the header from `md`
// up, full names in their own language in the phone nav sheet and the footer (`names`). The accessible name starts
// with the visible text ("de Deutsch", "Deutsch"), so voice control users can say what they see (WCAG 2.5.3).
defineProps<{ names?: boolean }>()
const { t, alternates, language } = useI18n('site')
</script>

<template>
  <ul v-if="alternates.length > 1" :class="names ? 'flex flex-wrap gap-x-5' : 'flex items-center'" :aria-label="t('language.label')">
    <li v-for="alt in alternates" :key="alt.code">
      <NuxtLink
        :to="alt.path"
        :hreflang="alt.language"
        :lang="alt.language"
        :aria-current="alt.current ? 'true' : undefined"
        :class="names
          ? 'inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline aria-[current]:text-foreground aria-[current]:underline'
          : 'inline-flex size-11 items-center justify-center rounded-md text-small font-medium text-muted-foreground uppercase transition-colors duration-150 hover:bg-accent hover:text-foreground aria-[current]:text-foreground aria-[current]:underline aria-[current]:underline-offset-4'"
      >
        <template v-if="names">
          <template v-if="alt.translated">{{ alt.name }}</template>
          <!-- The spoken name starts with the visible one: "Deutsch: Diese Seite ist nicht übersetzt, zur Startseite". -->
          <template v-else><span aria-hidden="true">{{ alt.name }}</span><span class="sr-only" :lang="language">{{ t('language.untranslated', { language: alt.name }) }}</span></template>
        </template>
        <template v-else>
          {{ alt.code }}<span class="sr-only normal-case">&nbsp;<template v-if="alt.translated">{{ alt.name }}</template><span v-else :lang="language">{{ t('language.untranslated', { language: alt.name }) }}</span></span>
        </template>
      </NuxtLink>
    </li>
  </ul>
</template>
