<script setup lang="ts">
const { format } = useI18n()
const props = defineProps<{ limit?: number }>()
const posts = useGinkoQuery('posts', () => ({ order: 'date desc', limit: props.limit }))
</script>

<template>
  <ul v-if="posts.items.length" class="list">
    <li v-for="post in posts.items" :key="post.id">
      <h3><NuxtLink :to="post.url">{{ post.data.title }}</NuxtLink></h3>
      <p class="meta"><time :datetime="post.data.date">{{ format.date(post.data.date, 'long') }}</time></p>
      <p>{{ post.data.summary }}</p>
    </li>
  </ul>
  <p v-else>No posts yet.</p>
</template>
