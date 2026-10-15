// The height in px of the bar an open screen keeps at the bottom of the window (the entry editor's save bar), 0 when
// none is open. The site layout hides the phone tab bar while it is above 0, and the toast sits above the bar, so
// neither covers the save status. Shared state, not provide/inject: the toast lives in app.vue, above the layout.
import { useState } from '#imports'

export const useBottomBar = () => useState<number>('studio:bottom-bar', () => 0)
