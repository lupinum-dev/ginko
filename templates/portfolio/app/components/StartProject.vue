<script setup lang="ts">
// The one way to start a project, with the details of content/site.md: the email (subject filled in) as the page's
// primary action, then email, phone and address as links for a visitor who prefers to call or come by.
const start = useStartProject()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-6">
    <Button v-if="start" as-child size="lg" class="self-start max-sm:self-stretch">
      <a :href="start">{{ t('start.action') }}</a>
    </Button>
    <SiteContact />
  </div>
</template>
