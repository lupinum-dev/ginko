<script setup lang="ts">
// The closing band with the free trial: at the end of the home page and of the other pages that show it (a feature's
// page shows this file when the template has it), so a visitor convinced there starts the trial in
// one tap.
const home = useGinko('home')
const { t } = useI18n()
const { name } = useGinkoSite()
</script>

<template>
  <BlockCta :title="t('home.cta.title', { name })" :text="t('home.cta.text', { name })" :action="{ label: t('home.trial'), to: home.data.trialUrl }" />
</template>
