<!-- Synced from templates/_features/site/app/components/site/Logo.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// The logo from app.config.ts, or the site name as text. On phones the short name, when there is one.
const config = useSiteAppConfig()
const { name } = useGinkoSite()
</script>

<template>
  <img v-if="config.logo" :src="config.logo.src" :width="config.logo.width" :height="config.logo.height" :alt="name" class="h-8 w-auto">
  <span v-else class="font-display text-body font-semibold">
    <template v-if="config.shortName">
      <span class="sm:hidden">{{ config.shortName }}</span>
      <span class="max-sm:hidden">{{ name }}</span>
    </template>
    <template v-else>{{ name }}</template>
  </span>
</template>
