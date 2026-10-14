<script setup lang="ts">
import { forgetLocalDrafts } from '../composables/useLocalDraft'

const { client, user } = useConvexAuth()
const { t } = useI18n()
const busy = ref(false)
async function signOut() {
  busy.value = true
  const id = user.value?.id
  try {
    await client.signOut()
    // Unsaved input kept in this browser must not stay behind on a shared computer.
    if (id) forgetLocalDrafts(id)
    await navigateTo('/login')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span v-if="user?.email" class="text-[0.95rem] text-muted-foreground">{{ user.email }}</span>
    <Button type="button" variant="ghost" :disabled="busy" @click="signOut">{{ t('nav.signOut') }}</Button>
  </div>
</template>
