<script setup lang="ts">
// The languages of this page (ginko-i18n alternates, so a doc links to its own translation). A menu in the
// header and in the phone menu. Each language is named in itself ("Deutsch").
const { t, alternates } = useI18n()
const { open, toggle } = useDocsPopover()

const nameOf = (code: string) => {
  const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1)
}
const current = computed(() => alternates.value.find((a) => a.current))
</script>

<template>
  <template v-if="alternates.length > 1">
    <div ref="popover" class="docs-lang">
      <button
        type="button" class="docs-icon-button" :aria-expanded="open" aria-controls="docs-lang-menu"
        :aria-label="`${t('docs.language')}: ${current ? nameOf(current.code) : ''}`" @click="toggle"
      >
        <Icon name="lucide:languages" class="docs-icon" />
        <span aria-hidden="true">{{ current?.code.toUpperCase() }}</span>
      </button>
      <ul v-if="open" id="docs-lang-menu" class="docs-popover">
        <li v-for="a in alternates" :key="a.code">
          <NuxtLink :to="a.path" :hreflang="a.code" :lang="a.code" :aria-current="a.current ? 'true' : undefined">
            {{ nameOf(a.code) }}
            <Icon v-if="a.current" name="lucide:check" class="docs-icon" />
          </NuxtLink>
        </li>
      </ul>
    </div>
  </template>
</template>
