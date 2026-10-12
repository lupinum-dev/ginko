<!-- Phones: the first three views as tabs at the bottom, the rest behind "More" (a sheet from below).
     The layout hides the bar where a page has its own bar at the bottom (the entry editor's save bar). -->
<script setup lang="ts">
import { EllipsisIcon } from '@lucide/vue'
import type { SiteLink } from '../utils/siteLinks'

const props = defineProps<{ links: SiteLink[] }>()
const route = useRoute()
const { t } = useI18n()
const tabs = computed(() => props.links.slice(0, 3))
const rest = computed(() => props.links.slice(3))
const moreActive = computed(() => rest.value.some((l) => isSiteLinkActive(route.path, l)))
const open = ref(false)
watch(() => route.path, () => { open.value = false })
const tab = 'group grid min-w-0 flex-1 justify-items-center gap-1 pt-2 pb-1.5 text-[12px] font-medium text-muted-foreground no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring/80 aria-[current=page]:text-foreground'
const tile = 'relative grid h-8 w-14 place-items-center rounded-lg group-aria-[current=page]:bg-primary group-aria-[current=page]:text-primary-foreground'
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur"
    :aria-label="t('nav.views')"
  >
    <NuxtLink v-for="l in tabs" :key="l.to" :to="l.to" :class="tab" :aria-current="isSiteLinkActive(route.path, l) ? 'page' : undefined">
      <span :class="tile">
        <component :is="l.icon" class="size-5" aria-hidden="true" />
        <span v-if="l.count" aria-hidden="true" class="absolute -top-1 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-[5px] text-[11px] font-semibold text-primary-foreground ring-2 ring-background">{{ l.count }}</span>
      </span>
      <span class="max-w-full truncate">{{ l.short }}</span>
      <span v-if="l.count" class="sr-only">({{ t('nav.toReviewCount', { count: l.count }) }})</span>
    </NuxtLink>
    <Sheet v-if="rest.length" v-model:open="open">
      <SheetTrigger as-child>
        <button type="button" :class="tab" :aria-current="moreActive ? 'page' : undefined">
          <span :class="tile"><EllipsisIcon class="size-5" aria-hidden="true" /></span>
          {{ t('nav.more') }}
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" class="rounded-t-2xl px-2 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader class="px-3 pt-2 pb-1"><SheetTitle>{{ t('nav.more') }}</SheetTitle></SheetHeader>
        <nav class="grid gap-0.5" :aria-label="t('nav.more')">
          <NuxtLink
            v-for="l in rest" :key="l.to" :to="l.to" :aria-current="isSiteLinkActive(route.path, l) ? 'page' : undefined"
            class="flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-foreground no-underline hover:bg-muted aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
          >
            <component :is="l.icon" class="size-5 text-muted-foreground" aria-hidden="true" />{{ l.label }}
          </NuxtLink>
        </nav>
      </SheetContent>
    </Sheet>
  </nav>
</template>
