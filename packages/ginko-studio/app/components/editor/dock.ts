// The formatting bar on a phone: while the editor has the focus, it sticks to the bottom of the part of the screen
// that is not covered by the keyboard (the "visual viewport"). A pure function, so it can be tested without a phone.

/** The fields of `window.visualViewport` the position needs. */
export interface ViewportBox {
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
}

export interface DockPosition {
  /** Where the bar's top-left corner goes, from the top-left of the layout viewport (use as `translate(x, y)` on a fixed element at 0,0). */
  x: number
  y: number
  width: number
}

/**
 * The bar sits on the bottom edge of the visible area. The keyboard shrinks `height`; a pinch zoom or a keyboard that
 * pushes the page up moves `offsetTop`/`offsetLeft`. The bar never goes above the top of the visible area, even if it is
 * taller than the visible area.
 */
export function dockPosition(viewport: ViewportBox, barHeight: number): DockPosition {
  const y = Math.max(viewport.offsetTop, viewport.offsetTop + viewport.height - barHeight)
  return { x: viewport.offsetLeft, y, width: viewport.width }
}

/** A touch screen: the finger is the pointer, so a soft keyboard is likely. */
export const isTouchScreen = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
