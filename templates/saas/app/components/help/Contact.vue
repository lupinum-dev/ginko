<script setup lang="ts">
// Where to turn when the help pages do not answer the question: the support email and phone of content/site.md.
// On the help start page and under every help page (DocsPageEnd).
const { t } = useI18n()
const titleId = useId()
</script>

<template>
  <aside :aria-labelledby="titleId" class="flex flex-col gap-3 rounded-block border p-6">
    <h2 :id="titleId" class="text-h3 font-semibold">{{ t('help.stuck') }}</h2>
    <p class="max-w-2xl text-muted-foreground">{{ t('help.stuckText') }}</p>
    <SiteContact :address="false" />
  </aside>
</template>
