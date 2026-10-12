// The formatting bar above the keyboard on a phone: where it goes, as a pure function of the visual viewport.
import { describe, expect, test } from 'vitest'
import { dockPosition } from '../app/components/editor/dock.ts'

describe('dockPosition', () => {
  // The wrong behaviour it catches: a bar that stays at the bottom of the layout viewport, under the keyboard.
  test.each([
    ['no keyboard: the bottom edge of the screen', { width: 390, height: 844, offsetLeft: 0, offsetTop: 0 }, 48, { x: 0, y: 796, width: 390 }],
    ['keyboard up (iOS: the layout viewport stays, the visual one shrinks)', { width: 390, height: 520, offsetLeft: 0, offsetTop: 0 }, 48, { x: 0, y: 472, width: 390 }],
    ['the page is scrolled inside the visual viewport', { width: 390, height: 520, offsetLeft: 0, offsetTop: 130 }, 48, { x: 0, y: 602, width: 390 }],
    ['pinch-zoomed in: follows the visible part, also sideways', { width: 195, height: 422, offsetLeft: 100, offsetTop: 50 }, 48, { x: 100, y: 424, width: 195 }],
    ['a bar taller than the visible area stays inside its top edge', { width: 390, height: 30, offsetLeft: 0, offsetTop: 200 }, 48, { x: 0, y: 200, width: 390 }],
  ])('%s', (_name, viewport, bar, expected) => {
    expect(dockPosition(viewport, bar)).toEqual(expected)
  })
})
