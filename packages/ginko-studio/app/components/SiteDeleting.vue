<!-- A site whose deletion has started: nothing else of it opens. Owners and admins see when it goes and can cancel (GDPR deletion, 7 days). -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { opErrorOf } from '../composables/useOps'

const props = defineProps<{ slug: string, name: string, at: number }>()
const { t, format } = useI18n()
const { mutate: cancel, pending } = useConvexMutation(api.sites.cancelDeletion)
const problem = ref('')
const date = computed(() => format.date(new Date(props.at), { day: 'numeric', month: 'long', year: 'numeric' }))

async function undo() {
  problem.value = ''
  try {
    await cancel({ site: props.slug })
  } catch (e) {
    problem.value = opErrorOf(e).message
  }
}
</script>

<template>
  <div class="grid w-full max-w-[760px] justify-items-start gap-3 px-4 pt-4 min-[720px]:px-6 min-[720px]:pt-8">
    <div class="grid w-full gap-3 rounded-md bg-warning/12 px-4 py-3" role="status">
      <p class="font-semibold">{{ t('site.deleting.text', { site: name, date }) }}</p>
      <p v-if="problem" class="font-semibold text-destructive" role="alert">{{ problem }}</p>
      <div class="flex flex-wrap gap-2">
        <Button type="button" :disabled="pending" @click="undo">{{ t('site.deleting.cancel') }}</Button>
        <Button as-child variant="outline"><NuxtLink to="/?all">{{ t('nav.mySites') }}</NuxtLink></Button>
      </div>
    </div>
  </div>
</template>
