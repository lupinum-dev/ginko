<script setup lang="ts">
// The docs body: the navigation on the side and the page next to it. Public: a site builds its own pages inside the
// docs frame with it (slots: default, `bar`). In the layer's own frame the header holds the search and, on phones, the
// navigation. Inside a site's layout the shell brings both: the search above the navigation, and on phones a bar with
// a button that opens the navigation as a sheet, the search, and the page's own controls (slot `bar`, the table of
// contents). `docs.search: false` in app.config leaves the search out (a site with <DocsSearch /> in its own header).
const { t } = useI18n()
const standalone = useDocsStandalone()
const search = !standalone && useAppConfig().docs?.search !== false
const nav = ref(false)
</script>

<template>
  <div class="docs-shell">
    <nav class="docs-sidebar" :aria-label="t('docs.nav')">
      <div v-if="search" class="docs-sidebar-search">
        <DocsSearch />
      </div>
      <DocsSidebar />
    </nav>
    <div id="docs-content" class="docs-content" tabindex="-1">
      <div class="docs-bar">
        <div v-if="!standalone" class="docs-bar-start">
          <button type="button" class="docs-bar-nav" aria-haspopup="dialog" :aria-expanded="nav" @click="nav = true">
            <DocsIcon name="lucide:panel-left-open" class="docs-icon" />{{ t('docs.contents') }}
          </button>
          <!-- A second trigger for phones; the one above the navigation keeps the keyboard shortcut. -->
          <DocsSearch v-if="search" :shortcut="false" />
        </div>
        <slot name="bar" />
      </div>
      <slot />
    </div>
    <DocsNavSheet v-if="!standalone" v-model:open="nav" />
  </div>
</template>
