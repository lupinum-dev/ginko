<script setup lang="ts">
import { Quote } from '@lucide/vue'

/** One quote: the words large, then who said it. No photo: a quote stands by its words (and never a stock face). */
defineProps<{ text: string, name?: string, role?: string }>()
</script>

<template>
  <figure class="flex max-w-3xl flex-col gap-6">
    <Quote class="size-8 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
    <blockquote class="text-h3 font-medium text-balance">
      <p>{{ text }}</p>
    </blockquote>
    <figcaption v-if="name || role" class="text-muted-foreground">
      <span v-if="name" class="font-medium text-foreground">{{ name }}</span><template v-if="name && role">, </template>{{ role }}
    </figcaption>
  </figure>
</template>
