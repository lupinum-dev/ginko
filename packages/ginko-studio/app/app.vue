<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'

// Undo from the message must outlive the sheet that saved (see useOps).
provideLastingOps()
// The signed-in person's language setting wins over the browser's (see useAccountLocale).
useAccountLocale()
// reka-ui builds its ids with Vue's useId, which depends on the position in the component tree; behind
// Nuxt's async layout that position differs between server and client (hydration mismatch on every id).
// A counter per app instance gives the same ids on both sides, in render order.
let count = 0
const useStableId = (deterministicId?: string, prefix = 'reka') => deterministicId ?? `${prefix}-${count++}`
</script>

<template>
  <ConfigProvider :use-id="useStableId">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppToast />
  </ConfigProvider>
</template>
