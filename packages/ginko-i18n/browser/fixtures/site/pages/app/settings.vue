<script setup lang="ts">
// A user-locale zone page (`userLocale: ['/app/**']`): one URL, the language comes from the user.
const { t, locale, switchLocale } = useI18n()
</script>

<template>
  <div>
    <h1 data-test="title">
      {{ t('home.title') }}
    </h1>
    <p data-test="locale">
      {{ locale }}
    </p>
    <button
      data-test="set-de"
      @click="switchLocale('de')"
    >
      Deutsch
    </button>
    <button
      data-test="set-en"
      @click="switchLocale('en')"
    >
      English
    </button>
  </div>
</template>
