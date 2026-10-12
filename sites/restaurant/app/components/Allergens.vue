<!-- Allergen codes (LMIV, Austrian letters) as letters. The full name is read by screen readers and shown on hover;
     every page with these letters also shows the visible key (AllergenKey). -->
<script setup lang="ts">
const props = defineProps<{ codes: readonly string[] }>()
const { labels } = useSite()
const { t } = useI18n()
const sorted = computed(() => [...props.codes].sort())
</script>

<template>
  <span class="allergens">
    <template v-if="sorted.length">
      <abbr v-for="code in sorted" :key="code" :title="labels.allergens[code]"><span aria-hidden="true">{{ code }}</span><span class="sr">{{ labels.allergens[code] }}</span></abbr>
    </template>
    <span v-else class="none">{{ t('noAllergens') }}</span>
  </span>
</template>

<style scoped>
.allergens { display: inline-flex; flex-wrap: wrap; gap: 4px; vertical-align: middle; }
abbr {
  text-decoration: none;
  display: inline-grid;
  place-items: center;
  min-width: 1.5em;
  height: 1.5em;
  padding-inline: 0.2em;
  border: 1px solid var(--rule);
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ink-2);
  cursor: help;
}
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.none { font-size: 0.9rem; color: var(--ink-2); }
</style>
