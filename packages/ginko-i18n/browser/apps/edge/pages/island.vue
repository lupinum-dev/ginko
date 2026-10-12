<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div>
    <h1 data-test="title">
      Island
    </h1>
    <LocaleIsland :locale="locale" />
    <NuxtIsland
      name="LocaleIsland"
      :context="{ url: $route.path }"
    />
  </div>
</template>
