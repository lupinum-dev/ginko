<script setup lang="ts">
import type { ImageValue } from '@lupinum/ginko'

export interface Card {
  key: string
  title: string
  to: string
  text?: string
  /** A date, price or status line above the title, in tabular numbers. */
  meta?: string
  image?: ImageValue
}

/** Two to four cards per row; the whole card is one link (the title's link stretches over it). Photos are 3:2. */
withDefaults(defineProps<{ items: Card[], columns?: 2 | 3 | 4 }>(), { columns: 3 })
</script>

<template>
  <ul
    class="grid gap-6 sm:grid-cols-2"
    :class="{ 'lg:grid-cols-3': columns === 3, 'lg:grid-cols-4': columns === 4 }"
  >
    <li
      v-for="item in items"
      :key="item.key"
      class="group relative flex flex-col overflow-hidden rounded-block border bg-card transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-ring hover:bg-muted"
    >
      <GinkoImage
        v-if="item.image"
        :image="item.image"
        sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw"
        class="aspect-3/2 w-full bg-muted object-cover"
      />
      <div class="flex flex-1 flex-col gap-2 p-6">
        <p v-if="item.meta" class="text-small text-muted-foreground tabular-nums">{{ item.meta }}</p>
        <h3 class="text-h3">
          <NuxtLink :to="item.to" class="outline-none after:absolute after:inset-0">{{ item.title }}</NuxtLink>
        </h3>
        <p v-if="item.text" class="text-muted-foreground">{{ item.text }}</p>
      </div>
    </li>
  </ul>
</template>
