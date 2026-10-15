<!-- Withdraw on one row of "Waiting for approval" (OwnProposals). Each row has its own mutation, so its
     button stays disabled while its own call runs, whatever happens on the other rows. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { opErrorOf } from '../composables/useOps'
import { useToast } from '../composables/useToast'

const props = defineProps<{ proposal: string }>()
const { t } = useI18n()
const { show } = useToast()
const withdraw = useConvexMutation(api.proposals.withdraw)

async function run() {
  try {
    await withdraw.mutate({ proposal: props.proposal })
    show(t('history.withdrawn'))
  } catch (e) {
    show(opErrorOf(e).message, { tone: 'err' })
  }
}
</script>

<template>
  <Button type="button" variant="ghost" class="h-11" :disabled="withdraw.pending.value" @click="run">{{ t('history.withdraw') }}</Button>
</template>
