<script setup lang="ts">
// The languages of this page (ginko-i18n alternates, so a doc links to its own translation), each named in itself
// ("Deutsch"). In the header a menu; with `list` (the phone menu) a row of links, one tap each. A language without
// this page says so, in the page's language (`lang` sits on the name only), because its link leads to that language's start page.
const props = defineProps<{ list?: boolean }>()
const { t, alternates } = useI18n()
const { open, toggle } = useDocsPopover()
const current = computed(() => alternates.value.find((a) => a.current))
</script>

<template>
  <template v-if="alternates.length > 1">
    <nav v-if="props.list" class="docs-lang-list" :aria-label="t('docs.language')">
      <NuxtLink v-for="a in alternates" :key="a.code" :to="a.path" :hreflang="a.language" :aria-current="a.current ? 'page' : undefined">
        <span :lang="a.language">{{ a.name }}</span>
        <small v-if="!a.translated">{{ t('docs.untranslated') }}</small>
      </NuxtLink>
    </nav>
    <div v-else ref="popover" class="docs-lang">
      <button
        type="button" class="docs-icon-button" :aria-expanded="open" aria-controls="docs-lang-menu"
        :aria-label="`${t('docs.language')}: ${current?.name ?? ''}`" @click="toggle"
      >
        <DocsIcon name="lucide:languages" class="docs-icon" />
        <span aria-hidden="true">{{ current?.code.toUpperCase() }}</span>
      </button>
      <ul v-if="open" id="docs-lang-menu" class="docs-popover">
        <li v-for="a in alternates" :key="a.code">
          <NuxtLink :to="a.path" :hreflang="a.language" :aria-current="a.current ? 'page' : undefined">
            <span>
              <span :lang="a.language">{{ a.name }}</span>
              <small v-if="!a.translated">{{ t('docs.untranslated') }}</small>
            </span>
            <DocsIcon v-if="a.current" name="lucide:check" class="docs-icon" />
          </NuxtLink>
        </li>
      </ul>
    </div>
  </template>
</template>
