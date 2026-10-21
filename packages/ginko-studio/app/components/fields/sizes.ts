// Touch targets (DESIGN.md): 44 px on a touch screen, 40 px with a mouse. Button and Input set this
// themselves; the select trigger is neither, so it sets its own height here.
/** The select trigger sets its own height through `data-size`. */
export const SELECT_CONTROL = 'data-[size=default]:h-10 data-[size=default]:pointer-coarse:h-11'
/**
 * One option of a choice or choices field as a chip (design A): a quiet border, the chosen one in the accent colour,
 * a focus ring around the whole chip. 32 px with a mouse, so a row of allergens stays one or two lines; 44 px on touch.
 */
export const OPTION_CHIP = 'min-h-8 cursor-pointer gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-[13px] leading-snug font-medium hover:bg-foreground/[0.03] has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:text-accent-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/80 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 pointer-coarse:min-h-11 pointer-coarse:text-sm'
/**
 * A number or money input with its unit inside the box ("13,50 €", "250 g"). The box draws the border and the focus
 * ring; the input inside has none, so the unit reads as part of the value.
 */
export const UNIT_BOX = 'flex h-10 w-full cursor-text items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/80 has-[[aria-invalid=true]]:border-destructive dark:bg-input/30 pointer-coarse:h-11'
export const UNIT_INPUT = 'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent pr-1 shadow-none focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent pointer-coarse:h-full'
/** A click on the unit text puts the cursor in the input of the same box (a mouse convenience). */
export function focusUnitInput(event: MouseEvent) {
  const box = event.currentTarget
  if (box instanceof HTMLElement) box.querySelector('input')?.focus()
}
export const UNIT_TEXT = 'shrink-0 pr-3 text-sm text-muted-foreground select-none'
