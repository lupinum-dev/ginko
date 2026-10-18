<!-- Synced from templates/_features/site/app/components/block/Cards.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { ImageValue } from '@lupinum/ginko'
import { ArrowRight } from '@lucide/vue'

export interface Card {
  key: string
  title: string
  to: string
  text?: string
  /** A date, price or status line above the title, in tabular numbers. */
  meta?: string
  image?: ImageValue
}

/** Two to four cards per row; the whole card is one link (the title's link stretches over it), marked by an arrow.
 *  Photos are 3:2. `headingLevel`: h3 under a section's h2 (default), h2 when the cards follow the page's h1.
 *  `compact`: on phones (below `sm`) each card is one row, a square photo of 96 px at the start next to the meta line
 *  and the title, without the text and the arrow, so a list of three fits in less than a screen. */
const props = withDefaults(defineProps<{ items: Card[], columns?: 2 | 3 | 4, headingLevel?: 'h2' | 'h3', compact?: boolean }>(), { columns: 3, headingLevel: 'h3' })
// Never an empty column at lg: fewer items than `columns` take that many columns (two at least; one item stays as is).
const lgColumns = computed(() => (props.items.length > 1 ? Math.min(props.columns, Math.max(2, props.items.length)) : props.columns))
const sizes = computed(() => `(min-width: 1024px) 384px, (min-width: 640px) 50vw, ${props.compact ? '96px' : '100vw'}`)
</script>

<template>
  <ul
    class="grid gap-6 sm:grid-cols-2"
    :class="{ 'lg:grid-cols-3': lgColumns === 3, 'lg:grid-cols-4': lgColumns === 4, 'max-sm:gap-3': compact }"
  >
    <li
      v-for="item in items"
      :key="item.key"
      class="group relative flex overflow-hidden rounded-block border bg-card transition-[color,background-color,border-color] duration-150 hover:bg-muted has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-ring"
      :class="compact ? 'max-sm:items-center sm:flex-col' : 'flex-col'"
    >
      <GinkoImage
        v-if="item.image"
        :image="item.image"
        :sizes="sizes"
        class="aspect-3/2 w-full bg-muted object-cover"
        :class="{ 'max-sm:m-3 max-sm:me-0 max-sm:aspect-square max-sm:size-24 max-sm:shrink-0 max-sm:rounded-md': compact }"
      />
      <div class="flex flex-1 flex-col gap-2 p-6" :class="{ 'max-sm:gap-1 max-sm:p-4': compact }">
        <p v-if="item.meta" class="text-small text-muted-foreground tabular-nums">{{ item.meta }}</p>
        <component :is="headingLevel" class="text-h3">
          <NuxtLink :to="item.to" class="outline-none after:absolute after:inset-0">{{ item.title }}</NuxtLink>
        </component>
        <p v-if="item.text" class="text-muted-foreground" :class="{ 'max-sm:hidden': compact }">{{ item.text }}</p>
        <ArrowRight class="mt-auto size-5 text-muted-foreground rtl:-scale-x-100" :class="{ 'max-sm:hidden': compact }" aria-hidden="true" />
      </div>
    </li>
  </ul>
</template>
