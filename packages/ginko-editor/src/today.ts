import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { todayIn } from '@lupinum/ginko'

// One tick per minute and on return to the tab, shared by every caller. Only the browser ticks.
const tick = ref(0)
let ticking = false

/**
 * Today's date in `timezone`, moving on at midnight: an editor left open overnight offers the new
 * "Heute", "Diese Woche" and week state, not yesterday's.
 */
export function useToday(timezone: MaybeRefOrGetter<string>) {
  if (typeof document !== 'undefined' && !ticking) {
    ticking = true
    setInterval(() => { tick.value++ }, 60_000)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick.value++ })
  }
  return computed(() => {
    void tick.value
    return todayIn(toValue(timezone))
  })
}
