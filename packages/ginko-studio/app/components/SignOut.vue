<script setup lang="ts">
import { useSignOut } from '../composables/useSignOut'

const { user } = useConvexAuth()
const { t } = useI18n()
const { busy, signOut } = useSignOut()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span v-if="user?.email" class="text-[0.95rem] text-muted-foreground">{{ user.email }}</span>
    <Button type="button" variant="ghost" :disabled="busy" @click="signOut">{{ t('nav.signOut') }}</Button>
  </div>
</template>
