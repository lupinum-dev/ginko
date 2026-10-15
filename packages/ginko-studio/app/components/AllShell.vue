<!-- Alles bearbeiten frame: the area list beside the content on wide screens, a back link on phones. -->
<script setup lang="ts">
import type { Brick } from '@lupinum/ginko'

defineProps<{ slug: string; bricks: [string, Brick][]; current?: string; removedActive?: boolean; translationsActive?: boolean; back?: { to: string; label: string } }>()
</script>

<template>
  <div class="mx-auto max-w-[1400px] px-4 pt-4 min-[900px]:grid min-[900px]:grid-cols-[240px_minmax(0,1fr)] min-[900px]:gap-8 min-[900px]:px-6 min-[900px]:pt-6">
    <div class="hidden min-[900px]:sticky min-[900px]:top-[calc(var(--studio-header-height)+1.25rem)] min-[900px]:block min-[900px]:self-start"><AllNav :slug="slug" :bricks="bricks" :current="current" :removed-active="removedActive" :translations-active="translationsActive" /></div>
    <div>
      <Button v-if="back" as-child variant="link" class="mb-1 h-11 gap-1.5 px-0 font-semibold">
        <NuxtLink :to="back.to"><span aria-hidden="true">←</span> {{ back.label }}</NuxtLink>
      </Button>
      <slot />
    </div>
  </div>
</template>
