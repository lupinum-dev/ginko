<!-- The verdict under Today's title (UI.md 3): how many things need the person, and the due areas as links to their
     cards. It waits for every source (a skeleton holds the line), so it never says "nothing" while something loads;
     a failed read says so instead. The line keeps its height, so nothing under it moves; a due link is 48px tall to tap
     without making the line taller. -->
<script setup lang="ts">
import { computed } from 'vue'
import { CircleAlertIcon, CircleCheckIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { Skeleton } from '@studio/components/ui/skeleton'

const props = defineProps<{
  verdict?: { count: number; due: string[] }
  loadError: boolean
  /** The label of a due area (a card or a plan section). */
  labelOf: (key: string) => string
}>()
const emit = defineEmits<{ area: [key: string] }>()
const { t, locale } = useI18n()

/** The due labels joined the language's way ("A, B und C"): the labels become links, the joining words stay text. */
const dueParts = computed(() => {
  const keys = props.verdict?.due ?? []
  let i = 0
  return new Intl.ListFormat(locale.value, { type: 'conjunction' }).formatToParts(keys.map(props.labelOf))
    .map((part) => (part.type === 'element' ? { key: keys[i++]!, text: part.value } : { text: part.value }))
})
const reload = () => reloadNuxtApp({ force: true })
</script>

<template>
  <div class="flex min-h-6 flex-wrap items-center gap-x-1.5 text-sm" data-test="verdict">
    <template v-if="loadError">
      <CircleAlertIcon class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      <span class="text-muted-foreground">{{ t('today.loadFailed') }}</span>
      <Button type="button" variant="ghost" size="sm" class="max-[679px]:min-h-12" @click="reload">{{ t('errors.reload') }}</Button>
    </template>
    <Skeleton v-else-if="!verdict" class="h-5 w-56" />
    <p v-else-if="!verdict.count" class="flex items-center gap-1.5 text-muted-foreground">
      <CircleCheckIcon class="size-4 flex-none" aria-hidden="true" />{{ t('today.verdict.none') }}
    </p>
    <p v-else class="flex flex-wrap items-center gap-x-1.5">
      <CircleAlertIcon class="size-4 flex-none text-warning" aria-hidden="true" />
      <span class="font-medium">{{ t('today.verdict.some', { count: verdict.count }) }}</span>
      <span v-if="verdict.due.length" class="text-muted-foreground">
        {{ t('today.verdict.due') }}
        <template v-for="(part, i) in dueParts" :key="i">
          <a v-if="part.key" :href="`#b-${part.key}`" class="relative font-medium text-foreground underline decoration-foreground/30 underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3 hover:decoration-foreground" @click.prevent="emit('area', part.key)">{{ part.text }}</a>
          <template v-else>{{ part.text }}</template>
        </template>
      </span>
    </p>
  </div>
</template>
