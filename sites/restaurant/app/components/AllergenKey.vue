<!-- The visible key for the allergen letters shown on the same page. -->
<script setup lang="ts">
const props = defineProps<{ codes: readonly string[] }>()
const { labels } = useSite()
const { t } = useI18n()
const sorted = computed(() => [...new Set(props.codes)].sort())
</script>

<template>
  <section v-if="sorted.length" class="legend" aria-labelledby="legend-title">
    <h2 id="legend-title">{{ t('allergenTitle') }}</h2>
    <dl>
      <div v-for="code in sorted" :key="code"><dt>{{ code }}</dt><dd>{{ labels.allergens[code] }}</dd></div>
    </dl>
  </section>
</template>

<style scoped>
.legend { margin-top: 48px; padding: 24px; background: var(--paper-2); border-radius: var(--radius); }
h2 { font-size: 1.4rem; margin-bottom: 12px; }
dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 6px 24px; }
dl div { display: flex; gap: 10px; }
dt { font-weight: 700; min-width: 1.2em; }
dd { margin: 0; color: var(--ink-2); }
</style>
