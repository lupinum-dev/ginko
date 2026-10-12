<script setup lang="ts">

const { t } = useI18n()
const notices = useGinko('notices')
</script>

<template>
  <div v-if="notices.items.length" class="notices">
    <p v-for="item in notices.items" :key="item.id" class="wrap notice">
      <span :lang="langOf(item, 'text')">{{ item.data.text }}</span>
      <a v-if="safeHref(item.data.link)" :href="safeHref(item.data.link)" rel="noopener">{{ t('more') }}</a>
    </p>
  </div>
</template>

<style scoped>
/* The only yellow strip on the site: a notice in the colour of barrier tape, with dark text. */
.notices { background: var(--yellow); color: var(--yellow-ink); }
.notice { display: flex; flex-wrap: wrap; gap: 0 14px; align-items: baseline; padding-block: 8px; font-size: 0.95rem; font-weight: 500; line-height: 1.45; }
.notice + .notice { padding-top: 0; }
a { color: var(--yellow-ink); font-weight: 700; padding-block: 6px; }
</style>
