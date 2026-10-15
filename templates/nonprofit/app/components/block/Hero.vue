<!-- Synced from templates/_features/site/app/components/block/Hero.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { ImageValue } from '@lupinum/ginko'

/**
 * The first section of the home page: the page's one h1, a lead, one primary and one secondary action, and an
 * optional photo (16:9). Without a photo the text takes the full width: a complete layout, not a missing image.
 * Slots: `status`, one line above the title that answers the visitor's first question (open now, the next date);
 * the default slot, a short line after the actions (another way to get in touch).
 */
defineProps<{
  title: string
  lead?: string
  primary?: { label: string, to: string }
  secondary?: { label: string, to: string }
  image?: ImageValue
}>()
const titleId = useId()
</script>

<template>
  <section :aria-labelledby="titleId" class="mx-auto max-w-page px-gutter pt-12 md:pt-20">
    <div :class="image ? 'grid items-center gap-10 lg:grid-cols-12 lg:gap-16' : 'max-w-4xl'">
      <div class="flex flex-col gap-6" :class="image && 'lg:col-span-7'">
        <slot name="status" />
        <h1 :id="titleId" class="text-h1">{{ title }}</h1>
        <p v-if="lead" class="max-w-3xl text-lead text-muted-foreground">{{ lead }}</p>
        <div v-if="primary || secondary" class="mt-2 flex flex-wrap gap-3">
          <Button v-if="primary" as-child size="lg" class="max-sm:w-full">
            <NuxtLink :to="primary.to">{{ primary.label }}</NuxtLink>
          </Button>
          <Button v-if="secondary" as-child variant="secondary" size="lg" class="max-sm:w-full">
            <NuxtLink :to="secondary.to">{{ secondary.label }}</NuxtLink>
          </Button>
        </div>
        <slot />
      </div>
      <GinkoImage
        v-if="image"
        :image="image"
        eager
        sizes="(min-width: 1024px) 480px, 100vw"
        class="aspect-video w-full rounded-block bg-muted object-cover lg:col-span-5"
      />
    </div>
  </section>
</template>
