<script setup lang="ts">
import type { Component } from 'vue'

export interface Feature {
  title: string
  text: string
  /** A lucide icon component, for example `Leaf` from '@lucide/vue'. */
  icon?: Component
}

/** Two to six short items divided by lines, no cards. Use inside BlockSection. */
defineProps<{ items: Feature[] }>()
</script>

<template>
  <ul class="grid gap-x-10 sm:grid-cols-2">
    <li v-for="item in items" :key="item.title" class="flex flex-col gap-3 border-t py-8">
      <component :is="item.icon" v-if="item.icon" class="size-6 text-primary" aria-hidden="true" />
      <h3 class="text-h3">{{ item.title }}</h3>
      <p class="text-muted-foreground">{{ item.text }}</p>
    </li>
  </ul>
</template>
