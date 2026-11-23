<script setup lang="ts">
// The side navigation: the section tabs (when the docs have several), then the pages of the active tab in their
// sections, then the site's DocsSidebarEnd. Used in the sidebar, the phone sheet and the header menu.
// Up to three tabs stand side by side. More do not fit one row with readable names: then a button names the
// active tab and opens the list of all tabs.
const { t } = useI18n()
const { tabs, activeTab, sections } = useDocs()
const { open, toggle } = useDocsPopover()
// The sidebar and the header menu can both be on the page: each needs its own id for aria-controls.
const menuId = useId()
</script>

<template>
  <div>
    <nav v-if="tabs.length > 3" ref="popover" class="docs-tabs-menu" :aria-label="t('docs.sections')">
      <button type="button" :aria-expanded="open" :aria-controls="menuId" @click="toggle">
        <span>{{ activeTab }}</span>
        <DocsIcon name="lucide:chevrons-up-down" class="docs-icon" />
      </button>
      <ul v-if="open" :id="menuId" class="docs-popover">
        <li v-for="tab in tabs" :key="tab.title">
          <NuxtLink :to="tab.path" :aria-current="tab.title === activeTab ? 'true' : undefined">
            <span>{{ tab.title }}</span>
            <DocsIcon v-if="tab.title === activeTab" name="lucide:check" class="docs-icon" />
          </NuxtLink>
        </li>
      </ul>
    </nav>
    <nav v-else-if="tabs.length" class="docs-tabs" :aria-label="t('docs.sections')">
      <NuxtLink v-for="tab in tabs" :key="tab.title" :to="tab.path" :aria-current="tab.title === activeTab ? 'true' : undefined">{{ tab.title }}</NuxtLink>
    </nav>
    <section v-for="(s, i) in sections" :key="i" class="docs-nav-section">
      <h2 v-if="s.title" class="docs-nav-heading">{{ s.title }}</h2>
      <DocsNavTree :nodes="s.nodes" />
    </section>
    <DocsSidebarEnd />
  </div>
</template>
