<!-- Pages outside a site. Signed-in pages (My sites, Account settings: `definePageMeta({ topBar: true })`) get a slim
     top bar with the Ginko mark and the person's menu, and a centred column; sign-in, invite and the error page stay one
     narrow card. On wide screens both sit on the canvas, like the site shell. -->
<script setup lang="ts">
const route = useRoute()
const topBar = computed(() => route.meta.topBar === true)
</script>

<template>
  <div class="min-h-dvh min-[900px]:bg-canvas">
    <template v-if="topBar">
      <header class="sticky top-0 z-20 border-b bg-background min-[900px]:bg-sidebar">
        <div class="flex h-14 items-center justify-between gap-3 px-4 min-[900px]:px-6">
          <NuxtLink to="/?all" class="flex items-center gap-2 rounded-md text-[15px] font-semibold text-foreground">
            <GinkoMark /> Ginko
          </NuxtLink>
          <AccountMenu :manager="false" :updating="false" side="bottom" />
        </div>
      </header>
      <div class="mx-auto w-full max-w-[880px] px-4 pt-6 pb-20 min-[900px]:px-8 min-[900px]:pt-12">
        <slot />
      </div>
    </template>
    <div v-else class="mx-auto max-w-[432px] px-4 pt-8 pb-20 min-[720px]:pt-[12vh]">
      <p class="mb-8 flex items-center gap-2 font-semibold text-muted-foreground"><GinkoMark /> Ginko</p>
      <slot />
    </div>
  </div>
</template>
