// Moves "today" on (useGinkoToday) when midnight passes in the site's time zone: once right after
// hydration (a cached page rendered yesterday), every minute, and when a background tab comes back.
// Collections from useGinko() follow, so expired notices and past events disappear without a reload.
import { defineNuxtPlugin, onNuxtReady, useRuntimeConfig } from '#imports'
import { todayIn } from '../../internal.ts'
import { useGinkoToday } from './composables.ts'
import type { GinkoPublicConfig } from './shared.ts'

export default defineNuxtPlugin(() => {
  const timeZone = (useRuntimeConfig().public.ginko as GinkoPublicConfig).timeZone
  const today = useGinkoToday()
  const refresh = () => {
    const now = todayIn(timeZone)
    if (today.value !== now) today.value = now
  }
  onNuxtReady(() => {
    refresh()
    setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh() })
  })
})
