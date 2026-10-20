// Touch targets (DESIGN.md): 44 px on a touch screen, 40 px with a mouse. Button and Input set this
// themselves; the select trigger is neither, so it sets its own height here.
/** The select trigger sets its own height through `data-size`. */
export const SELECT_CONTROL = 'data-[size=default]:h-10 data-[size=default]:pointer-coarse:h-11'
