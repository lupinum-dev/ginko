<script setup lang="ts">
const { locale, localePath } = useI18n()
// The list takes its links from the entries' own slugs (D6), never from a static path.
const { data: posts } = await useFetch('/api/posts', { query: { locale } })
</script>

<template>
  <ul>
    <li
      v-for="p in posts"
      :key="p.slug"
    >
      <NuxtLink
        data-test="post"
        :to="localePath(`/blog/${p.slug}`)"
      >{{ p.title }}</NuxtLink>
    </li>
  </ul>
</template>
