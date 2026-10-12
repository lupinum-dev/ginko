<script setup lang="ts">
const { client, user } = useConvexAuth()
const { t } = useI18n()
const busy = ref(false)
async function signOut() {
  busy.value = true
  try {
    await client.signOut()
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
