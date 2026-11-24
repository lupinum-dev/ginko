<script setup lang="ts">
import type { TabsTriggerProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { TabsTrigger, useForwardProps } from "reka-ui"
import { cn } from '@studio/lib/utils'

const props = defineProps<TabsTriggerProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <TabsTrigger
    data-slot="tabs-trigger"
    :class="cn(
      // Underlined (a filled, lifted item is the segmented toggle). The gold line marks the current tab.
      `text-muted-foreground hover:text-foreground data-[state=active]:border-marker data-[state=active]:font-semibold data-[state=active]:text-foreground -mb-px inline-flex h-10 flex-none items-center justify-center gap-1.5 rounded-none border-b-2 border-transparent text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
      props.class,
    )"
    v-bind="forwardedProps"
  >
    <slot />
  </TabsTrigger>
</template>
