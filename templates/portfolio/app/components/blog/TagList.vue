<!-- Synced from templates/_features/blog/app/components/blog/TagList.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/** The tags as chips: label and number of posts, linked to the tag's page. A screen reader hears one phrase per chip. */
defineProps<{ tags: { name: string, slug: string, to: string, count: number }[] }>()
const { t } = useI18n('blog')
</script>

<template>
  <ul class="flex flex-wrap gap-2">
    <li v-for="tag in tags" :key="tag.slug">
      <NuxtLink :to="tag.to" rel="tag" class="inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-small transition-[color,background-color,border-color] duration-150 hover:bg-accent">
        <span class="sr-only">{{ t('topicCount', { name: tag.name, count: tag.count }) }}</span>
        <span aria-hidden="true">{{ tag.name }}</span><span class="text-muted-foreground tabular-nums" aria-hidden="true">{{ tag.count }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>
