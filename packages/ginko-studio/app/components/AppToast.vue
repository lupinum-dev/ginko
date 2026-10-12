<script setup lang="ts">
import 'vue-sonner/style.css'
const { t } = useI18n()
</script>

<template>
  <!-- Phones: above the tab bar (4.25rem + safe area), so the views stay reachable while a toast shows. -->
  <Toaster position="bottom-center" :mobile-offset="{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }" theme="system" close-button :container-aria-label="t('entry.toast.region')" :toast-options="{ closeButtonAriaLabel: t('entry.toast.close') }" />
</template>
