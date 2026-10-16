<!-- Synced from templates/_features/logos-quotes/app/components/block/Logos.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/** A row of partner logos in their order, each at one height (2.5rem) and in its own width. A logo with a website
 *  links there. Logos are images with the partner's name as alt text; they keep their own colours. */
defineProps<{ items: GinkoItem<'logos'>[] }>()
</script>

<template>
  <ul class="flex flex-wrap items-center gap-x-12 gap-y-8">
    <li v-for="logo in items" :key="logo.id">
      <component
        :is="logo.data.url ? 'a' : 'span'"
        :href="logo.data.url"
        :rel="logo.data.url ? 'noopener' : undefined"
        class="inline-flex min-h-11 items-center rounded-md"
      >
        <GinkoImage :image="logo.data.image" sizes="200px" class="h-10 w-auto" />
      </component>
    </li>
  </ul>
</template>
