<!-- "Delete site" on the team page (owners and admins): the person types the site's address, then the deletion
     starts and runs 7 days (SiteDeleting shows the countdown and the way back). -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { opErrorOf } from '../composables/useOps'

const props = defineProps<{ slug: string, name: string }>()
const { t } = useI18n()
const { mutate: start, pending } = useConvexMutation(api.sites.startDeletion)
const typed = ref('')
const problem = ref('')
const matches = computed(() => typed.value === props.slug)

async function submit() {
  if (!matches.value) return
  problem.value = ''
  try {
    await start({ site: props.slug, confirm: typed.value })
  } catch (e) {
    problem.value = opErrorOf(e).message
  }
}
</script>

<template>
  <section class="grid gap-2 border-t pt-5" aria-labelledby="delete-site-title">
    <h2 id="delete-site-title" class="text-base font-semibold tracking-tight">{{ t('site.delete.title') }}</h2>
    <p class="text-[13px] text-muted-foreground">{{ t('site.delete.text', { site: name }) }}</p>
    <form class="grid gap-3" @submit.prevent="submit">
      <div class="grid gap-1.5">
        <label for="delete-site-confirm" class="text-sm leading-snug font-medium">{{ t('site.delete.confirmLabel', { slug }) }}</label>
        <Input id="delete-site-confirm" v-model="typed" autocomplete="off" autocapitalize="off" spellcheck="false" />
      </div>
      <p v-if="problem" class="font-semibold text-destructive" role="alert">{{ problem }}</p>
      <Button type="submit" variant="destructive" class="justify-self-start" :disabled="!matches || pending">{{ t('site.delete.button') }}</Button>
    </form>
  </section>
</template>
