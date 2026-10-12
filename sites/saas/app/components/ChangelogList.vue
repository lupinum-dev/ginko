<script setup lang="ts">
import { formatShortDate } from '../utils/site'

// The changelog newest first (the brick's order). `limit` shows only the latest entries, without their text.
const props = defineProps<{ limit?: number; level: 'h2' | 'h3' }>()
const { lang } = useSite()
const { t } = useI18n()
const changelog = useGinko('changelog')
const entries = computed(() => changelog.value.items.slice(0, props.limit))
</script>

<template>
  <p v-if="!entries.length" class="empty">{{ t('noChangelog') }}</p>
  <ol v-else class="list" :class="{ short: limit }">
    <li v-for="entry in entries" :key="entry.id" class="entry">
      <div class="meta">
        <component :is="level" class="version mono">{{ entry.data.version }}</component>
        <time class="date mono" :datetime="entry.data.date">{{ formatShortDate(entry.data.date, lang) }}</time>
      </div>
      <div class="main">
        <ul v-if="entry.data.tags.length" class="tags" :aria-label="t('tagsLabel')">
          <li v-for="tag in entry.data.tags" :key="tag"><TagChip :value="tag" /></li>
        </ul>
        <GinkoMarkdown v-if="!limit" :value="entry.data.body" class="prose" :lang="langOf(entry, 'body')" />
      </div>
    </li>
  </ol>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; border-top: var(--line) solid var(--ink); }
.entry { display: grid; gap: 10px 32px; padding-block: 24px; border-bottom: var(--line) solid var(--rule); }
.meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 14px; }
.version { margin: 0; font-family: var(--mono); font-weight: 700; font-stretch: 100%; font-variation-settings: normal; font-size: 1.35rem; letter-spacing: 0; }
.date { color: var(--ink-2); font-size: 0.95rem; }
.main { display: grid; gap: 12px; align-content: start; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; margin: 0; padding: 0; }
.short .entry { padding-block: 16px; align-items: center; }
.short .main { gap: 0; }
@media (min-width: 720px) {
  .entry { grid-template-columns: 180px 1fr; }
  .meta { flex-direction: column; gap: 2px; }
  .short .meta { flex-direction: column; }
}
</style>
