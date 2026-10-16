<!-- Synced from templates/_features/changelog/app/components/changelog/Latest.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import type { ReleaseSummary } from '~/composables/useChangelog'

/** The newest releases as rows divided by lines: date, version (a link to its section of the changelog) and its
 *  summary; then a link to the whole changelog. Use inside BlockSection, whose h2 is the label. */
withDefaults(defineProps<{ items: ReleaseSummary[], headingLevel?: 'h2' | 'h3' }>(), { headingLevel: 'h3' })
const { t, format } = useI18n('changelog')
const path = useGinkoPath()
</script>

<template>
  <div class="flex flex-col gap-6">
    <ul class="flex flex-col border-b">
      <li v-for="release in items" :key="release.id" class="group relative flex flex-col gap-1 border-t py-6 sm:flex-row sm:gap-8">
        <p class="shrink-0 text-small text-muted-foreground tabular-nums sm:w-40 sm:pt-0.5">
          <time :datetime="release.date">{{ format.date(release.date) }}</time>
        </p>
        <div class="flex min-w-0 flex-col gap-1">
          <component :is="headingLevel" class="text-body font-semibold tabular-nums">
            <NuxtLink :to="release.to" class="underline-offset-4 after:absolute after:inset-0 group-hover:underline">{{ t('version', { version: release.version }) }}</NuxtLink>
          </component>
          <p v-if="release.summary" class="text-muted-foreground">{{ release.summary }}</p>
        </div>
      </li>
    </ul>
    <NuxtLink :to="path('changelog')" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
      {{ t('all') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
    </NuxtLink>
  </div>
</template>
