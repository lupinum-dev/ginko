<!-- "Delete account" on Account settings (GDPR): a card of its own below the settings, the button asks once more in a dialog. A person who is the last owner
     of a site gets the server's message naming the sites; nothing is deleted then. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { opErrorOf } from '../composables/useOps'
import { forgetLocalDrafts } from '../composables/useLocalDraft'

const { t } = useI18n()
const { client, user } = useConvexAuth()
const { mutate: deleteAccount } = useConvexMutation(api.account.deleteAccount)
const open = ref(false)
const busy = ref(false)
const problem = ref('')

async function confirm() {
  busy.value = true
  problem.value = ''
  try {
    await deleteAccount({})
  } catch (e) {
    problem.value = opErrorOf(e).message
    open.value = false
    busy.value = false
    return
  }
  // The session is gone on the server already; signing out only clears this browser.
  const id = user.value?.id
  if (id) forgetLocalDrafts(id)
  try {
    await client.signOut()
  } catch {
    // Nothing left to sign out of.
  }
  await navigateTo('/login')
}
</script>

<template>
  <section class="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card px-4 py-4 sm:px-6 sm:py-5" aria-labelledby="delete-account-title">
    <div class="grid min-w-0 flex-1 basis-72 gap-1">
      <h2 id="delete-account-title" class="text-sm font-semibold">{{ t('sites.deleteAccount.title') }}</h2>
      <p class="max-w-[65ch] text-[13px] text-muted-foreground">{{ t('sites.deleteAccount.text') }}</p>
      <p v-if="problem" class="text-sm font-semibold text-destructive" role="alert">{{ problem }}</p>
    </div>
    <!-- Quiet until the dialog asks once more: the red, filled button is only there. -->
    <Button type="button" variant="ghost" class="text-destructive hover:bg-destructive/10 hover:text-destructive" @click="open = true">{{ t('sites.deleteAccount.button') }}</Button>
    <Dialog v-model:open="open">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ t('sites.deleteAccount.title') }}</DialogTitle>
          <DialogDescription>{{ t('sites.deleteAccount.text') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="busy" @click="open = false">{{ t('site.common.cancel') }}</Button>
          <Button type="button" variant="destructive" :disabled="busy" @click="confirm">{{ t('sites.deleteAccount.button') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
