<script setup lang="ts">
import type { BlogPost } from '~/composables/useBlog'

/** The newest post, large, at the top of the home page: photo (3:2), date and reading time, title (the link: the
 *  whole block opens the post), summary and authors. Without a photo the text takes the full width. */
defineProps<{ post: BlogPost }>()
const { format, t } = useI18n('blog')
</script>

<template>
  <article class="group relative grid gap-6 lg:grid-cols-12 lg:items-center lg:gap-12">
    <GinkoImage
      v-if="post.image"
      :image="post.image"
      eager
      sizes="(min-width: 1216px) 680px, (min-width: 1024px) 56vw, 100vw"
      class="aspect-3/2 w-full rounded-block bg-muted object-cover lg:col-span-7"
    />
    <div class="flex flex-col gap-3" :class="post.image ? 'lg:col-span-5' : 'max-w-3xl lg:col-span-12'">
      <p class="text-small text-muted-foreground">
        <time :datetime="post.date">{{ format.date(post.date) }}</time>
        <template v-if="post.minutes"><span aria-hidden="true"> · </span><span class="sr-only">, </span>{{ t('minutes', { count: post.minutes }) }}</template>
      </p>
      <h2 class="text-h2">
        <NuxtLink :to="post.to" class="underline-offset-4 after:absolute after:inset-0 group-hover:underline">{{ post.title }}</NuxtLink>
      </h2>
      <p v-if="post.description" class="text-lead text-muted-foreground">{{ post.description }}</p>
      <p v-if="post.authors.length" class="flex items-center gap-3 pt-1">
        <InitialsAvatar v-for="author in post.authors" :key="author.id" :name="author.name" />
        <span class="font-medium">{{ format.list(post.authors.map((author) => author.name)) }}</span>
      </p>
    </div>
  </article>
</template>
