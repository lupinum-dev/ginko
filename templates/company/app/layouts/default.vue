<!-- Synced from templates/_features/site/app/layouts/default.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'

// Every page: skip link, notices, header, content, footer. Reka's ConfigProvider gives its parts (sheet, menus,
// accordion) the text direction of the language, so arrows and the sheet's side follow right-to-left languages.
const { locale, locales } = useI18n()
const dir = computed(() => locales.find((l) => l.code === locale.value)?.dir ?? 'ltr')
</script>

<template>
  <ConfigProvider :dir="dir">
    <div class="flex min-h-dvh flex-col">
      <SiteSkipLink />
      <SiteNotice />
      <SiteHeader />
      <main id="main" tabindex="-1" class="flex-1 focus-visible:outline-none">
        <slot />
      </main>
      <SiteFooter />
    </div>
  </ConfigProvider>
</template>
