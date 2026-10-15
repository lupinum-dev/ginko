<!-- Synced from templates/_features/site/app/components/site/NavSheet.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { ArrowRight, Menu } from '@lucide/vue'

// The navigation on phones: a sheet from the inline start (the right in right-to-left languages). It closes after a
// navigation; reka-ui keeps the focus inside while open and returns it to the button on close.
defineProps<{ links: { key: string, label: string, to: string }[] }>()
const { t } = useI18n('site')
const open = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => { open.value = false })
</script>

<template>
  <Sheet v-model:open="open">
    <SheetTrigger as-child>
      <Button variant="ghost" size="icon" class="md:hidden">
        <Menu aria-hidden="true" />
        <span class="sr-only">{{ t('nav.open') }}</span>
      </Button>
    </SheetTrigger>
    <SheetContent side="start" :close-label="t('close')" :aria-describedby="undefined" class="px-6 pt-5 pb-8">
      <SheetTitle class="flex h-11 items-center text-small text-muted-foreground">{{ t('nav.title') }}</SheetTitle>
      <nav :aria-label="t('nav.label')">
        <ul class="flex flex-col border-t">
          <li v-for="link in links" :key="link.key" class="border-b">
            <SiteNavLink :to="link.to" class="flex min-h-14 items-center justify-between gap-4 py-3 text-h3 font-medium underline-offset-4 aria-[current=page]:underline">
              {{ link.label }}
              <ArrowRight class="size-5 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
            </SiteNavLink>
          </li>
        </ul>
      </nav>
    </SheetContent>
  </Sheet>
</template>
