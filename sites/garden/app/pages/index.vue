<script setup lang="ts">
const settings = useGinko('settings')
const notice = useGinko('notice')
const today = useGinkoToday()
const path = useGinkoPath()
const showNotice = computed(() => !!notice.value.data.text && (!notice.value.data.until || notice.value.data.until >= today.value))
useGinkoSeo({ title: 'Home', description: settings.value.data.tagline })
</script>

<template>
  <div class="column">
    <p v-if="showNotice" class="notice" role="status">{{ notice.data.text }}</p>
    <h1>{{ settings.data.siteName }}</h1>
    <p class="lede">{{ settings.data.tagline }}</p>
    <section aria-labelledby="latest-posts">
      <h2 id="latest-posts">Latest posts</h2>
      <PostList :limit="3" />
      <p><NuxtLink :to="path('posts')">All posts</NuxtLink></p>
    </section>
    <section aria-labelledby="next-events">
      <h2 id="next-events">Next events</h2>
      <EventList :limit="3" />
      <p><NuxtLink :to="path('events')">All events</NuxtLink></p>
    </section>
  </div>
</template>
