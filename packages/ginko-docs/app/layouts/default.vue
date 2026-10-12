<script setup lang="ts">
// The standalone frame: banner, header, page, footer. A site with its own `layouts/default.vue` replaces it, and
// the docs pages then sit inside the site's frame (the docs body, DocsShell, works either way).
const { t } = useI18n()
const { theme, banner } = useAppConfig().docs ?? {}
useHead({
  // `docs-standalone` turns on the page background, font and color-scheme (docs.css); embedded, the site owns those.
  htmlAttrs: { class: 'docs-standalone', 'data-docs-theme': theme && theme !== 'default' ? theme : undefined },
})
// "Skip to content" goes past the docs navigation to the page itself when the page has one (DocsShell), else to main.
function skip(event: MouseEvent) {
  const target = document.getElementById('docs-content') ?? document.getElementById('docs-main')
  if (!target) return
  event.preventDefault()
  target.focus()
  target.scrollIntoView()
}
</script>

<template>
  <div class="docs-frame">
    <a class="docs-skip" href="#docs-main" @click="skip">{{ t('docs.skip') }}</a>
    <DocsBanner v-if="banner" :id="banner.id" :href="banner.href" />
    <DocsHeader />
    <main id="docs-main" class="docs-frame-main" tabindex="-1">
      <slot />
    </main>
    <DocsFooter />
  </div>
</template>
