<script setup lang="ts">
import type { BlogPost } from '~/composables/useBlog'

/** Posts as rows divided by lines: date and authors, title (the link), summary, and the cover (3:2) at the end of the
 *  row from `sm` up, above the text on phones. A post without a cover is a row without an image, not a gap. `images` false
 *  leaves the covers out (a teaser on a home page). `eager`: the list opens the page, so the first photo loads at once (it is the largest thing on a phone's first screen). */
withDefaults(defineProps<{ items: BlogPost[], headingLevel?: 'h2' | 'h3', images?: boolean, eager?: boolean }>(), { headingLevel: 'h2', images: true })
const { format, t } = useI18n('blog')
</script>

<template>
  <ul class="flex flex-col border-b">
    <li v-for="(post, i) in items" :key="post.id" class="group relative flex flex-col gap-5 border-t py-8 sm:flex-row-reverse sm:items-start sm:gap-8">
      <GinkoImage
        v-if="images && post.image"
        :image="post.image"
        sizes="(min-width: 640px) 224px, 100vw"
        :eager="eager && i === 0"
        class="aspect-3/2 w-full shrink-0 rounded-block bg-muted object-cover sm:w-56"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <p class="text-small text-muted-foreground">
          <time :datetime="post.date">{{ format.date(post.date) }}</time>
          <template v-if="post.authors.length"><span aria-hidden="true"> · </span><span class="sr-only">, </span>{{ t('by', { names: format.list(post.authors.map((a) => a.name)) }) }}</template>
        </p>
        <component :is="headingLevel" class="text-h3">
          <NuxtLink :to="post.to" class="underline-offset-4 after:absolute after:inset-0 group-hover:underline">{{ post.title }}</NuxtLink>
        </component>
        <p v-if="post.description" class="text-muted-foreground">{{ post.description }}</p>
      </div>
    </li>
  </ul>
</template>
