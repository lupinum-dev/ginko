<script setup lang="ts">
defineProps<{ error: { statusCode: number } }>()
</script>

<template>
  <div class="site">
    <main class="plain">
      <h1>{{ error.statusCode === 404 ? 'Page not found' : 'Something went wrong' }}</h1>
      <p><a href="/">Back to the home page</a></p>
    </main>
  </div>
</template>
