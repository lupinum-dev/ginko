<!-- Synced from templates/_features/ui/app/components/ui/badge/Badge.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { BadgeVariants } from '.'
import { reactiveOmit } from '@vueuse/core'
import { Primitive } from 'reka-ui'
import { cn } from '@/lib/utils'
import { badgeVariants } from '.'

const props = withDefaults(defineProps<PrimitiveProps & {
  variant?: BadgeVariants['variant']
  class?: HTMLAttributes['class']
}>(), { as: 'span' })

const delegatedProps = reactiveOmit(props, 'class', 'variant')
</script>

<template>
  <Primitive
    data-slot="badge"
    :class="cn(badgeVariants({ variant }), props.class)"
    v-bind="delegatedProps"
  >
    <slot />
  </Primitive>
</template>
