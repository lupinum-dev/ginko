<script setup lang="ts">
// One line for the visitor whose pump has stopped, under the home page's actions: the service number to call and when
// it answers (content/serviceLine.md).
const line = useServiceLine()
const { t } = useI18n()
</script>

<template>
  <p v-if="line" class="flex flex-wrap items-center gap-x-2 text-muted-foreground">
    <span>{{ t('serviceLine.stopped') }}</span>
    <a :href="telHref(line.phone)" dir="ltr" class="inline-flex min-h-11 items-center font-medium text-foreground tabular-nums underline underline-offset-4">{{ line.phone }}</a>
    <span aria-hidden="true" class="max-sm:hidden">·</span>
    <span class="tabular-nums">{{ line.hours }}</span>
  </p>
</template>
