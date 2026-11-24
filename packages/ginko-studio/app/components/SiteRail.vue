<!-- The rail of a site on wide screens: the site's tile (to My sites), the views, the person's menu. It stands on the
     canvas (ink), so its colours are the canvas ones. Gold marks the current view and the count of open reviews. -->
<script setup lang="ts">
import type { SiteLink } from '../utils/siteLinks'

defineProps<{ links: SiteLink[], initial: string, siteName: string }>()
const route = useRoute()
const { t } = useI18n()
</script>

<template>
  <div class="sticky top-3 flex h-[calc(100dvh-1.5rem)] w-24 flex-none flex-col items-center pt-2.5 pb-2 text-canvas-foreground">
    <NuxtLink
      to="/?all" :aria-label="`${siteName} · ${t('nav.mySites')}`" :title="siteName"
      class="grid size-[46px] flex-none place-items-center rounded-[14px] rounded-bl-[4px] bg-canvas-foreground font-display text-[21px] font-extrabold text-canvas no-underline outline-none hover:bg-canvas-foreground/90 focus-visible:ring-3 focus-visible:ring-canvas-foreground/80 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >{{ initial }}</NuxtLink>
    <nav class="mt-5 grid gap-1" :aria-label="t('nav.views')">
      <NuxtLink
        v-for="l in links" :key="l.to" :to="l.to" :aria-current="isSiteLinkActive(route.path, l) ? 'page' : undefined"
        class="group grid w-[76px] justify-items-center gap-1 rounded-[10px] pt-1 pb-1.5 text-center text-[11.5px] leading-tight font-medium text-canvas-muted-foreground no-underline outline-none hover:text-canvas-foreground focus-visible:ring-3 focus-visible:ring-canvas-foreground/80 aria-[current=page]:font-semibold aria-[current=page]:text-canvas-foreground"
      >
        <span class="relative grid h-8 w-[46px] place-items-center rounded-[10px] transition-colors group-hover:bg-canvas-foreground/10 group-aria-[current=page]:bg-marker group-aria-[current=page]:text-marker-foreground">
          <component :is="l.icon" class="size-[18px]" aria-hidden="true" />
          <span
            v-if="l.count" aria-hidden="true" class="absolute -top-[5px] -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-marker px-[5px] text-[11px] font-bold text-marker-foreground ring-2 ring-canvas"
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
