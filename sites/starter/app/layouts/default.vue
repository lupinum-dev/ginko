<script setup lang="ts">
const settings = useGinko('settings')
const pages = useGinko('pages')
const path = usePagePath()
</script>

<template>
  <div class="site">
    <a class="skip" href="#main">Skip to content</a>
    <header class="header">
      <NuxtLink :to="path('home')" class="brand">{{ settings.data.siteName }}</NuxtLink>
      <nav aria-label="Main">
        <ul>
          <li v-for="page in pages.items" :key="page.id"><NuxtLink :to="page.url">{{ page.data.title }}</NuxtLink></li>
          <li><NuxtLink :to="path('posts')">Posts</NuxtLink></li>
          <li><NuxtLink :to="path('events')">Events</NuxtLink></li>
        </ul>
      </nav>
    </header>
    <main id="main"><slot /></main>
    <footer class="footer">
      <p v-if="settings.data.email"><a :href="`mailto:${settings.data.email}`">{{ settings.data.email }}</a></p>
      <address v-if="settings.data.address">{{ settings.data.address }}</address>
      <ul v-if="settings.data.social?.length" aria-label="Links">
        <li v-for="link in settings.data.social" :key="link._id"><a :href="safeHref(link.url)" rel="noopener">{{ link.label }}</a></li>
      </ul>
    </footer>
  </div>
</template>
