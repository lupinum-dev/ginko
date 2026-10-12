<!-- `EN: 3 missing` / `EN: 1 outdated` for one language (UI.md 10.6). With `to` the badges are links that open the entry in that language. -->
<script setup lang="ts">
import { Badge } from '@studio/components/ui/badge'

defineProps<{ locale: string; missing: number; outdated: number; to?: string; label?: string }>()
const { t } = useI18n()
</script>

<template>
  <component :is="to ? 'NuxtLink' : 'span'" v-if="missing || outdated" :to="to" :aria-label="label" class="inline-flex flex-wrap gap-1 no-underline">
    <Badge v-if="missing" variant="warning">{{ t('basics.translation.missing', { lang: locale.toUpperCase(), count: missing }) }}</Badge>
    <Badge v-if="outdated" variant="warning">{{ t('basics.translation.outdated', { lang: locale.toUpperCase(), count: outdated }) }}</Badge>
  </component>
</template>
