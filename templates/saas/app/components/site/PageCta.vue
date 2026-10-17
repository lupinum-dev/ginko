<script setup lang="ts">
// The closing band with the free trial: at the end of the home page, and of the changelog, each blog post and the FAQ
// (their feature pages show this file when the template has it), so a visitor convinced there starts the trial in
// one tap.
const home = useGinko('home')
const { t } = useI18n()
</script>

<template>
  <BlockCta :title="t('home.cta.title')" :text="t('home.cta.text')" :action="{ label: t('home.trial'), to: home.data.trialUrl }" />
</template>
