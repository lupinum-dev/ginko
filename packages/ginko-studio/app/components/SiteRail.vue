<!-- Wide screens: the views of one site as an icon rail on the canvas beside the framed panel (UI.md 10.2, design A).
     The current view is a filled primary tile; a count (changes to review) sits on its icon. The person's menu is at
     the foot. -->
<script setup lang="ts">
import type { SiteLink } from '../utils/siteLinks'

defineProps<{ links: SiteLink[], initial: string, siteName: string }>()
const route = useRoute()
const { t } = useI18n()
</script>

<template>
  <div class="sticky top-3 flex h-[calc(100dvh-1.5rem)] w-20 flex-none flex-col items-center pt-1.5 pb-1 text-foreground">
    <NuxtLink
      to="/?all" :aria-label="`${siteName} · ${t('nav.mySites')}`" :title="siteName"
      class="mb-4 grid size-11 flex-none place-items-center rounded-[10px] border border-primary bg-card text-base font-bold text-primary no-underline outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/80"
    >{{ initial }}</NuxtLink>
    <nav class="grid gap-0.5" :aria-label="t('nav.views')">
      <NuxtLink
        v-for="l in links" :key="l.to" :to="l.to" :aria-current="isSiteLinkActive(route.path, l) ? 'page' : undefined"
        class="group grid w-[72px] justify-items-center gap-1 rounded-lg pt-1 pb-1.5 text-center text-[11.5px] leading-tight font-medium text-muted-foreground no-underline outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/80 aria-[current=page]:text-foreground"
      >
        <span class="relative grid h-8 w-11 place-items-center rounded-lg transition-colors group-hover:bg-foreground/[0.06] group-aria-[current=page]:bg-primary group-aria-[current=page]:text-primary-foreground">
          <component :is="l.icon" class="size-[18px]" aria-hidden="true" />
          <span
            v-if="l.count" aria-hidden="true" class="absolute -top-[5px] -right-[3px] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-[5px] text-[11px] font-semibold text-primary-foreground ring-2 ring-canvas"
          >{{ l.count }}</span>
        </span>
        {{ l.label }}
        <span v-if="l.count" class="sr-only">({{ t('nav.toReviewCount', { count: l.count }) }})</span>
      </NuxtLink>
    </nav>
    <div class="mt-auto grid justify-items-center pt-3">
      <slot name="foot" />
    </div>
  </div>
</template>
