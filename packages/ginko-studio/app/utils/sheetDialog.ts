/** The native <dialog> the task and pick sheets open with showModal(): a sheet from below on phones, a panel on the
 * right from 900px. Native, so Escape and the close guard in TaskSheet stay the browser's own cancel event. */
export const SHEET_DIALOG = [
  'm-[auto_auto_0] max-h-[92dvh] w-full max-w-[560px] rounded-t-2xl border-0 bg-background p-0 text-foreground shadow-lg',
  'backdrop:bg-black/45 dark:backdrop:bg-black/70 open:animate-in open:fade-in-0 open:slide-in-from-bottom-8 open:duration-300',
  'min-[900px]:m-[0_0_0_auto] min-[900px]:h-dvh min-[900px]:max-h-dvh min-[900px]:max-w-[520px] min-[900px]:rounded-none min-[900px]:open:slide-in-from-right-8 min-[900px]:open:slide-in-from-bottom-0',
].join(' ')

/** A failed step inside a sheet. */
export const PROBLEM = 'rounded-md bg-destructive/10 px-3 py-2.5 font-semibold text-destructive'
