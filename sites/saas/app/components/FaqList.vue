<script setup lang="ts">
const langOf = useGinkoLang()
// Questions in the brick's manual order, as native <details>. The first one is open. `limit` shows only the first ones.
const props = defineProps<{ limit?: number }>()
const { t } = useI18n()
const faq = useGinko('faq')
const items = computed(() => faq.value.items.slice(0, props.limit))
</script>

<template>
  <p v-if="!items.length" class="empty">{{ t('noFaq') }}</p>
  <div v-else class="faq">
    <details v-for="(item, i) in items" :key="item.id" class="item" :open="i === 0">
      <summary :lang="langOf(item, 'question')">{{ item.data.question }}</summary>
      <GinkoMarkdown :value="item.data.answer" class="prose answer" :lang="langOf(item, 'answer')" />
    </details>
  </div>
</template>

<style scoped>
.faq { border-top: var(--line) solid var(--ink); max-width: 820px; }
.item { border-bottom: var(--line) solid var(--rule); }
summary {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  padding: 18px 0;
  min-height: 48px;
  font-family: var(--head);
  font-weight: 700;
  font-size: 1.1rem;
  line-height: 1.3;
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker { display: none; }
summary::after { content: '+'; font-family: var(--mono); font-weight: 500; font-size: 1.4rem; line-height: 1; flex: none; }
.item[open] summary::after { content: '−'; }
.answer { padding-bottom: 22px; }
</style>
