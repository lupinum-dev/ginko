<!-- Synced from templates/_features/site/app/components/site/SkipLink.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// The first tab stop of every page. Parked above the viewport until focused (not sr-only: Tailwind's not-sr-only
// would reset its padding on focus).
const { t } = useI18n('site')
</script>

<template>
  <a
    href="#main"
    class="fixed start-3 top-3 z-60 -translate-y-24 rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground focus:translate-y-0"
  >
    {{ t('skip') }}
  </a>
</template>
