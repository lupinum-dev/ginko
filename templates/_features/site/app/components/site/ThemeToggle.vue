<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'

// Switches between light and dark (@nuxtjs/color-mode; the first visit follows the system). The server cannot know
// the visitor's choice, so the icons switch by CSS and aria-pressed is set only after hydration.
const { t } = useI18n('site')
const colorMode = useColorMode()
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const dark = computed(() => colorMode.value === 'dark')
// Toggling back to the system's own scheme stores `system` again, so the site follows the system from then on.
function toggle() {
  const next = dark.value ? 'light' : 'dark'
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  colorMode.preference = next === system ? 'system' : next
}
</script>

<template>
  <Button variant="ghost" size="icon" :aria-pressed="mounted ? dark : undefined" @click="toggle">
    <Moon class="dark:hidden" aria-hidden="true" />
    <Sun class="hidden dark:block" aria-hidden="true" />
    <span class="sr-only">{{ t('theme') }}</span>
  </Button>
</template>
