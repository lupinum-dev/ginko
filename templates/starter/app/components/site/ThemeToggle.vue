<!-- Synced from templates/_features/site/app/components/site/ThemeToggle.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'

// Switches between light and dark (@nuxtjs/color-mode; the first visit follows the system). The server cannot know
// the visitor's choice, so the icons switch by CSS and aria-pressed is set only after hydration.
const { t } = useI18n('site')
const colorMode = useColorMode()
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const dark = computed(() => colorMode.value === 'dark')
function toggle() {
  colorMode.preference = dark.value ? 'light' : 'dark'
}
</script>

<template>
  <Button variant="ghost" size="icon" :aria-pressed="mounted ? dark : undefined" @click="toggle">
    <Moon class="dark:hidden" aria-hidden="true" />
    <Sun class="hidden dark:block" aria-hidden="true" />
    <span class="sr-only">{{ t('theme') }}</span>
  </Button>
</template>
