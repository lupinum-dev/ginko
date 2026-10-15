<!-- Synced from templates/_features/site/app/components/site/SkipLink.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
const { t } = useI18n('site')
</script>

<template>
  <a
    href="#main"
    class="sr-only z-60 rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
  >
    {{ t('skip') }}
  </a>
</template>
