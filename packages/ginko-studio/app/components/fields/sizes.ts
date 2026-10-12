// Touch targets (DESIGN.md): 44 px on a touch screen, 40 px with a mouse. Button and Input set this
// themselves; the select trigger is neither, so it sets its own height here.
/** The select trigger sets its own height through `data-size`. */
export const SELECT_CONTROL = 'data-[size=default]:h-10 data-[size=default]:pointer-coarse:h-11'

/** A field whose label sits inside its box (PrimeVue's IftaLabel): the box draws border, focus and error; the
 *  input, textarea or select trigger inside drops its own frame and height. */
export const CONTAINED_FIELD = [
  'grid cursor-text gap-px rounded-md border border-input bg-card px-3 pt-[7px] pb-2 transition-[border-color,box-shadow]',
  'focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/20 [&:focus-within_[data-slot=label]]:text-primary',
  'has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-destructive/20',
  '[&_:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger])]:w-full [&_:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger])]:max-w-none',
  '[&_:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger])]:rounded-none [&_:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger])]:border-0',
  '[&_:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger])]:bg-transparent dark:[&_:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger])]:bg-transparent',
  '[&_:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger])]:px-0 [&_:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger])]:py-0',
  '[&_:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger])]:shadow-none [&_:is([data-slot=input],[data-slot=textarea],[data-slot=select-trigger])]:ring-0',
  '[&_:is([data-slot=input],[data-slot=select-trigger])]:h-6 [&_:is([data-slot=input],[data-slot=select-trigger])]:pointer-coarse:h-7 [&_[data-slot=textarea]]:min-h-16',
].join(' ')
