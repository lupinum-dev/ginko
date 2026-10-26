<!-- The frame of a site page (design A): the title row (the h1 is the view's nav word, D26) with the page's actions on
     the right, an optional lede, the content, and an optional right column from 1100px (stacked under the content
     below). One left edge, width and padding for every page, so sibling pages line up and nothing jumps between tabs. `wide` is for grids (Files). -->
<script setup lang="ts">
defineProps<{ title: string; lede?: string; wide?: boolean }>()
defineSlots<{ default(): unknown; actions?(): unknown; lede?(): unknown; aside?(): unknown }>()
</script>

<template>
  <div :class="['w-full px-4 pt-4 pb-10 min-[900px]:px-8 min-[900px]:pt-7 min-[900px]:pb-12', wide ? 'max-w-[1440px]' : 'max-w-[1200px]']">
    <header class="mb-6 flex flex-wrap items-start gap-x-4 gap-y-3">
      <!-- At least 14rem (or the whole row): wide actions wrap under the title instead of squeezing it on a phone. -->
      <div class="min-w-[min(100%,14rem)] flex-1">
        <h1 class="text-[1.375rem] font-semibold tracking-tight">{{ title }}</h1>
        <!-- A slot may hold more than text (a skeleton while the words load): a <div> there, since a block inside a <p>
             is closed early by the browser's parser and no longer matches the server render. -->
        <div v-if="$slots.lede" class="mt-1 max-w-[65ch] text-muted-foreground min-[900px]:text-sm"><slot name="lede" /></div>
        <p v-else-if="lede" class="mt-1 max-w-[65ch] text-muted-foreground min-[900px]:text-sm">{{ lede }}</p>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2"><slot name="actions" /></div>
    </header>
    <div v-if="$slots.aside" class="grid gap-8 min-[1100px]:grid-cols-[minmax(0,1fr)_20rem] min-[1100px]:items-start">
      <div class="min-w-0"><slot /></div>
      <aside class="grid min-w-0 gap-4"><slot name="aside" /></aside>
    </div>
    <slot v-else />
  </div>
</template>
