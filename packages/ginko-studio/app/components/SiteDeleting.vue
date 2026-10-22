<!-- A site whose deletion has started: nothing else of it opens. Owners and admins see when it goes and can cancel (GDPR deletion, 7 days). -->
<script setup lang="ts">
import { api } from '#convex/api'
import { TriangleAlertIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { opErrorOf } from '../composables/useOps'
import StudioPage from './StudioPage.vue'

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
  <!-- The page frame of every site page, titled with the site's name, since none of its views opens any more. -->
  <StudioPage :title="name">
    <div class="flex max-w-[65ch] gap-3 rounded-xl border bg-warning/10 p-4" role="status">
      <TriangleAlertIcon class="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
      <div class="grid min-w-0 gap-3">
        <p class="font-semibold min-[900px]:text-[15px]">{{ t('site.deleting.text', { site: name, date }) }}</p>
        <p v-if="problem" class="text-sm font-semibold text-destructive" role="alert">{{ problem }}</p>
        <div class="flex flex-wrap gap-2">
          <Button type="button" :disabled="pending" @click="undo">{{ t('site.deleting.cancel') }}</Button>
          <Button as-child variant="outline"><NuxtLink to="/?all">{{ t('nav.mySites') }}</NuxtLink></Button>
        </div>
      </div>
    </div>
  </StudioPage>
</template>
