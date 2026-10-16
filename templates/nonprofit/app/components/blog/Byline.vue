<!-- Synced from templates/_features/blog/app/components/blog/Byline.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { BlogPost } from '~/composables/useBlog'

/** The authors of a post with their initials and role, under the post's header; the name links to the author's page
 *  when people have pages. */
defineProps<{ authors: BlogPost['authors'] }>()
const { t } = useI18n('blog')
</script>

<template>
  <ul v-if="authors.length" class="flex flex-wrap gap-x-8 gap-y-4" :aria-label="t('authors')">
    <li v-for="author in authors" :key="author.id" class="flex items-center gap-3">
      <InitialsAvatar :name="author.name" />
      <span class="flex flex-col">
        <NuxtLink v-if="author.to" :to="author.to" class="font-medium underline-offset-4 hover:underline">{{ author.name }}</NuxtLink>
        <span v-else class="font-medium">{{ author.name }}</span>
        <span v-if="author.role" class="text-small text-muted-foreground">{{ author.role }}</span>
      </span>
    </li>
  </ul>
</template>
