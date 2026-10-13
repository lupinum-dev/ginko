<!-- "Delete account" on "My sites" (GDPR): one section, the button asks once more in a dialog. A person who is the last owner
     of a site gets the server's message naming the sites; nothing is deleted then. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { opErrorOf } from '../composables/useOps'

const { t } = useI18n()
const { client } = useConvexAuth()
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
  try {
    await client.signOut()
  } catch {
    // Nothing left to sign out of.
  }
  await navigateTo('/login')
}
</script>

<template>
  <section class="grid gap-2 border-t pt-5" aria-labelledby="delete-account-title">
    <h2 id="delete-account-title" class="font-medium">{{ t('sites.deleteAccount.title') }}</h2>
    <p class="text-[13px] text-muted-foreground">{{ t('sites.deleteAccount.text') }}</p>
    <p v-if="problem" class="font-semibold text-destructive" role="alert">{{ problem }}</p>
    <Button type="button" variant="destructive" class="justify-self-start" @click="open = true">{{ t('sites.deleteAccount.button') }}</Button>

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
