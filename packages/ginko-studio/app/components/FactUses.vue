<!-- Under a field that is a fact (`facts` in the site config): which texts quote it, so a change here is made knowing
     where it shows. Closed it is one quiet line; open, the texts with links (UsedInList). -->
<script setup lang="ts">
import { useI18n } from '#imports'
import { ChevronRightIcon, QuoteIcon } from '@lucide/vue'
import type { FactQuote } from '../utils/facts'
import UsedInList from './UsedInList.vue'

defineProps<{ slug: string; quotes: readonly FactQuote[] }>()
const { t } = useI18n()
</script>

<template>
  <details class="group text-sm text-muted-foreground" data-test="fact-uses">
    <summary class="flex cursor-pointer list-none items-center gap-1.5 rounded-sm py-0.5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
      <QuoteIcon class="size-3.5 shrink-0" aria-hidden="true" />
      {{ t('fields.factUses', { count: quotes.length }) }}
      <ChevronRightIcon class="size-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
    </summary>
    <div class="grid gap-1.5 pt-1.5 pl-5">
      <p>{{ t('fields.factUsesHint') }}</p>
      <UsedInList :slug="slug" :uses="quotes" />
    </div>
  </details>
</template>
