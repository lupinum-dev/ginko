// Touch targets: 44 px on a touch screen. With a mouse a field (input, select, the unit box below) is 40 px and a
// button 36 px; the components in components/ui set this themselves.
/**
 * One option of a choice or choices field as a pill: a quiet border, the chosen one filled like the main button, a
 * focus ring around the whole pill. Its radio or checkbox is in the pill but not drawn (`OPTION_INPUT`): the fill
 * says "chosen". 34 px with a mouse, so a row of allergens stays one or two lines; 44 px on touch.
 */
export const OPTION_CHIP = 'relative min-h-[34px] cursor-pointer rounded-full border border-input bg-background px-3 py-1 text-[13px] leading-snug font-medium hover:bg-muted has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary has-[[data-state=checked]]:text-primary-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/80 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 pointer-coarse:min-h-11 pointer-coarse:px-4 pointer-coarse:text-sm'
/** The radio or checkbox of a pill: there for the keyboard and a screen reader, not drawn. */
export const OPTION_INPUT = 'sr-only'
/**
 * One option as a card with its radio drawn (publish now or later, the two times of a repeated hour): the chosen one
 * has a green edge of 2 px. No fill, so it also works inside the tinted publish panel.
 */
export const RADIO_CARD = 'min-h-10 cursor-pointer gap-2.5 rounded-[10px] border border-input bg-background py-2 pr-3.5 pl-3 font-medium has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:shadow-[inset_0_0_0_1px_var(--ring)] pointer-coarse:min-h-11'
/**
 * A number or money input with its unit inside the box ("13,50 €", "250 g"). The box draws the border and the focus
 * ring; the input inside has none, so the unit reads as part of the value.
 */
export const UNIT_BOX = 'flex h-10 w-full cursor-text items-center rounded-lg border border-input bg-background transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/80 has-[[aria-invalid=true]]:border-destructive pointer-coarse:h-11'
export const UNIT_INPUT = 'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent pr-1 shadow-none focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent pointer-coarse:h-full'
/** A click on the unit text puts the cursor in the input of the same box (a mouse convenience). */
export function focusUnitInput(event: MouseEvent) {
  const box = event.currentTarget
  if (box instanceof HTMLElement) box.querySelector('input')?.focus()
}
export const UNIT_TEXT = 'shrink-0 pr-3 text-sm text-muted-foreground select-none'
