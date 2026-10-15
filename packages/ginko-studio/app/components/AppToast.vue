<script setup lang="ts">
import 'vue-sonner/style.css'
import { useBottomBar } from '../composables/useBottomBar'

const { t } = useI18n()
// While the entry editor is open, the toast sits 12px above its save bar, so "Gespeichert" and Rückgängig never cover
// the save status. Elsewhere phones keep it above the tab bar (4.25rem + safe area), so the views stay reachable.
const bottomBar = useBottomBar()
const aboveBar = computed(() => (bottomBar.value > 0 ? { bottom: `${bottomBar.value + 12}px` } : undefined))
</script>

<template>
  <Toaster position="bottom-center" :offset="aboveBar" :mobile-offset="aboveBar ?? { bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }" theme="system" close-button :container-aria-label="t('entry.toast.region')" :toast-options="{ closeButtonAriaLabel: t('entry.toast.close') }" />
</template>
