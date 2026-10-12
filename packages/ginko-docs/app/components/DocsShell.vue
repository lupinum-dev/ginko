<script setup lang="ts">
// The docs body: the navigation on the side and the page next to it. On phones the navigation lives in the
// header's menu (DocsHeader); the bar above the page holds the page's own controls (slot `bar`, the table of
// contents). It needs no header of its own, so it works in the standalone frame and inside a site's layout alike.
const { t } = useI18n()
</script>

<template>
  <div class="docs-shell">
    <nav class="docs-sidebar" :aria-label="t('docs.nav')">
      <DocsSidebar />
    </nav>
    <div id="docs-content" class="docs-content" tabindex="-1">
      <div class="docs-bar">
        <slot name="bar" />
      </div>
      <slot />
    </div>
  </div>
</template>
