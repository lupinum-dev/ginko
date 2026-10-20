<!-- Inhalte frame (design A): on wide screens the area list is a side column of the panel, full height below the top
     bar; the page sits beside it. While the entry preview is open the column folds away (useAreaList) and the top bar
     gets a button to bring it back. Phones: the page alone, with a back link. -->
<script setup lang="ts">
import type { Brick } from '@lupinum/ginko'
import { PanelLeftIcon } from '@lucide/vue'
import { useAreaList } from '../composables/useAreaList'
import { usePanelBar } from '../composables/usePageHeader'

defineProps<{ slug: string; bricks: [string, Brick][]; current?: string; removedActive?: boolean; translationsActive?: boolean; back?: { to: string; label: string } }>()
const { t } = useI18n()
const { folded, foldable, toggle } = useAreaList()
const bar = usePanelBar()
</script>

<template>
  <div :class="['min-[900px]:grid min-[900px]:flex-1', folded ? 'min-[900px]:grid-cols-[minmax(0,1fr)]' : 'min-[900px]:grid-cols-[15.5rem_minmax(0,1fr)]']">
    <Teleport v-if="bar && foldable" to="#studio-lead">
      <Button type="button" variant="ghost" size="icon-sm" class="-ml-2 mr-1 text-muted-foreground" :aria-pressed="!folded" :aria-label="t('site.all.areaList')" :title="t('site.all.areaList')" @click="toggle()">
        <PanelLeftIcon aria-hidden="true" />
      </Button>
    </Teleport>
    <!-- The cell stretches to the page height (column colour and line to the bottom); the list inside it sticks. -->
    <aside v-show="!folded" class="hidden border-r bg-sidebar min-[900px]:block">
      <div class="min-[900px]:sticky min-[900px]:top-(--studio-header-height) min-[900px]:max-h-[calc(100dvh-5rem)] min-[900px]:overflow-y-auto min-[900px]:p-3">
        <AllNav :slug="slug" :bricks="bricks" :current="current" :removed-active="removedActive" :translations-active="translationsActive" overview />
      </div>
    </aside>
    <!-- The editor with its preview open lays out its own padding: the preview sits flush with the panel. -->
    <div :class="['min-w-0 px-4 pt-4', foldable ? 'min-[900px]:p-0' : 'min-[900px]:px-8 min-[900px]:pt-7']">
      <Button v-if="back" as-child variant="link" class="mb-1 h-11 gap-1.5 px-0 font-semibold min-[900px]:hidden">
        <NuxtLink :to="back.to"><span aria-hidden="true">←</span> {{ back.label }}</NuxtLink>
      </Button>
      <slot />
    </div>
  </div>
</template>
