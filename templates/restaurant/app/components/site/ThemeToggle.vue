<!-- Synced from templates/_features/site/app/components/site/ThemeToggle.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'

// Switches between light and dark (@nuxtjs/color-mode; the first visit follows the system). A toggle button: the name
// stays "Dark mode" and aria-pressed says whether the page is dark now, also when that comes from the system, so a
// screen reader says "Dark mode, pressed". The icon shows what a click gives (moon in light, sun in dark). The server
// cannot know the visitor's choice, so the icons switch by CSS and aria-pressed is set only after hydration.
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
