<script setup lang="ts">
// The side navigation: the section tabs (when the docs have several), then the pages of the active tab in their
// sections. Used in the sidebar and in the phone menu.
const { t } = useI18n()
const { tabs, activeTab, sections } = useDocs()
</script>

<template>
  <div>
    <nav v-if="tabs.length" class="docs-tabs" :aria-label="t('docs.sections')">
      <NuxtLink v-for="tab in tabs" :key="tab.title" :to="tab.path" :aria-current="tab.title === activeTab ? 'true' : undefined">{{ tab.title }}</NuxtLink>
    </nav>
    <section v-for="(s, i) in sections" :key="i" class="docs-nav-section">
      <h2 v-if="s.title" class="docs-nav-heading">{{ s.title }}</h2>
      <DocsNavTree :nodes="s.nodes" />
    </section>
  </div>
</template>
