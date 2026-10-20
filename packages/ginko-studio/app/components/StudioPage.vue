<!-- The frame of a site page (design A): the title row (the h1 is the view's nav word, D26) with the page's actions on
     the right, an optional lede, the content, and an optional right column from 1100px (stacked under the content
     below). One width and one padding for every page, so sibling pages line up. `wide` is for grids (Files). -->
<script setup lang="ts">
defineProps<{ title: string; lede?: string; wide?: boolean }>()
defineSlots<{ default(): unknown; actions?(): unknown; lede?(): unknown; aside?(): unknown }>()
</script>

<template>
  <div :class="['mx-auto w-full px-4 pt-4 pb-10 min-[900px]:px-8 min-[900px]:pt-7 min-[900px]:pb-12', wide ? 'max-w-[1440px]' : 'max-w-[1200px]']">
    <header class="mb-6 flex flex-wrap items-start gap-x-4 gap-y-3">
      <div class="min-w-0 flex-1">
        <h1 class="text-[1.375rem] font-semibold tracking-tight">{{ title }}</h1>
        <p v-if="lede || $slots.lede" class="mt-1 max-w-[65ch] text-muted-foreground min-[900px]:text-sm"><slot name="lede">{{ lede }}</slot></p>
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
