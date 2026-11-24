<!-- Pages outside a site.
     Signed-in pages (My sites, Account settings: `definePageMeta({ topBar: true })`) have the frame of a site, so nothing
     jumps when a person opens one: on wide screens the rail on the canvas (only the Ginko leaf and the person's menu) and
     the page in the panel, in one centred column.
     Sign-in, invite and the error page have no rail: one narrow card on paper, and on wide screens the brand panel
     with the leaf beside it. -->
<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const topBar = computed(() => route.meta.topBar === true)
const WORDMARK = 'font-display font-extrabold tracking-[-0.03em]'
</script>

<template>
  <div v-if="topBar" class="min-h-dvh min-[900px]:flex min-[900px]:bg-canvas min-[900px]:py-3 min-[900px]:pr-3">
    <GinkoMark class="pointer-events-none fixed -bottom-[190px] -left-[250px] size-[560px] text-canvas-leaf max-[899px]:hidden" />
    <div class="sticky top-3 hidden h-[calc(100dvh-1.5rem)] w-24 flex-none flex-col items-center pt-2.5 pb-2 min-[900px]:flex">
      <NuxtLink
        to="/?all" :aria-label="t('nav.mySites')"
        class="grid size-[46px] place-items-center rounded-[14px] outline-none focus-visible:ring-3 focus-visible:ring-canvas-foreground/80"
      ><GinkoMark class="size-[38px] text-marker" /></NuxtLink>
      <div class="mt-auto"><AccountMenu canvas :manager="false" :updating="false" /></div>
    </div>
    <div class="relative min-w-0 flex-1 min-[900px]:min-h-[calc(100dvh-1.5rem)] min-[900px]:overflow-clip min-[900px]:rounded-[18px] min-[900px]:rounded-bl-[6px] min-[900px]:bg-card">
      <header class="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur-sm min-[900px]:bg-card/95 min-[900px]:px-6">
        <NuxtLink to="/?all" :class="['flex items-center gap-2 rounded-md text-xl text-foreground no-underline', WORDMARK]">
          <GinkoMark class="text-marker min-[900px]:hidden" /> Ginko
        </NuxtLink>
        <div class="min-[900px]:hidden"><AccountMenu :manager="false" :updating="false" side="bottom" /></div>
      </header>
      <div class="mx-auto w-full max-w-[824px] px-4 pt-6 pb-20 min-[900px]:px-8 min-[900px]:pt-12">
        <slot />
      </div>
    </div>
  </div>
  <div v-else class="min-h-dvh bg-paper min-[900px]:grid min-[900px]:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]">
    <div class="relative hidden overflow-hidden bg-canvas p-14 text-canvas-foreground min-[900px]:flex min-[900px]:flex-col min-[900px]:justify-between">
      <GinkoMark class="pointer-events-none absolute -top-[40%] -left-[55%] h-auto w-[170%] rotate-180 text-canvas-leaf" />
      <GinkoMark class="pointer-events-none absolute top-[12%] left-[24%] h-auto w-[92%] text-marker" />
      <p :class="['relative flex items-center gap-2.5 text-[28px]', WORDMARK]"><GinkoMark class="size-9 text-marker" /> Ginko</p>
      <p :class="['relative max-w-[10ch] text-[clamp(2.5rem,4.4vw,3.5rem)] leading-none', WORDMARK]">{{ t('nav.claim') }}</p>
    </div>
    <div class="px-4 pt-8 pb-20 min-[900px]:grid min-[900px]:place-items-center min-[900px]:p-8">
      <div class="mx-auto w-full max-w-[432px] min-[900px]:max-w-[448px]">
        <p :class="['mb-8 flex items-center gap-2 text-xl min-[900px]:hidden', WORDMARK]"><GinkoMark class="text-marker" /> Ginko</p>
        <slot />
      </div>
    </div>
  </div>
</template>
