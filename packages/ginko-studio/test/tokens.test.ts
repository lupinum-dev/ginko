// The colour tokens of the Studio (app/assets/css/tailwind.css) are one contract: a later theme changes only values.
// These tests catch what a change of a value breaks without anyone seeing it: text that can no longer be read on its
// ground, a dark value changed in one of its two blocks only, and a colour written into a component instead of a token.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const app = fileURLToPath(new URL('../app/', import.meta.url))
const css = readFileSync(join(app, 'assets/css/tailwind.css'), 'utf8')

type Tokens = Record<string, string>
/** The text of the first block that starts with `head`. */
function body(head: string): string {
  const start = css.indexOf(head)
  expect(start, `block ${head}`).toBeGreaterThan(-1)
  return css.slice(css.indexOf('{', start + head.length - 1) + 1, css.indexOf('}', start))
}
/** The `--name: #rrggbb` lines of a block. */
const block = (head: string): Tokens =>
  Object.fromEntries([...body(head).matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1]!, m[2]!]))
/** `--hover-strength` of a block as a share (6% is 0.06): how much of the text colour `bg-hover` lays over a ground. */
function hoverStrength(head: string): number {
  const match = /--hover-strength:\s*(\d+)%;/.exec(body(head))
  expect(match, `--hover-strength in ${head}`).not.toBeNull()
  return Number(match![1]) / 100
}
const LIGHT = ':root {'
const DARK_BY_SYSTEM = ":root:not([data-theme='light']) {"
const DARK_BY_CHOICE = "[data-theme='dark'] {"
const light = block(LIGHT)
const darkBySystem = block(DARK_BY_SYSTEM)
const darkByChoice = block(DARK_BY_CHOICE)

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
/** `top` at `alpha` over `under`, as `bg-warning/14` draws it. */
const over = (top: string, alpha: number, under: string) =>
  `#${rgb(top).map((v, i) => Math.round(v * alpha + rgb(under)[i]! * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`

/** Text and the ground it stands on in the Studio. A name is a token; `[token, alpha, token]` is a tint over a ground. */
type Ground = string | [string, number, string]
const TEXT: [text: string, ground: Ground][] = [
  ['foreground', 'background'], ['foreground', 'sidebar'], ['foreground', 'muted'], ['foreground', 'paper'],
  ['canvas-foreground', 'canvas'], ['canvas-muted-foreground', 'canvas'], ['canvas', 'canvas-foreground'],
  ['card-foreground', 'card'], ['popover-foreground', 'popover'], ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'background'], ['muted-foreground', 'sidebar'], ['muted-foreground', 'muted'], ['muted-foreground', 'paper'],
  ['primary-foreground', 'primary'], ['sidebar-primary-foreground', 'sidebar-primary'], ['sidebar-accent-foreground', 'sidebar-accent'],
  ['accent-foreground', 'accent'], ['marker-foreground', 'marker'], ['background', 'ring'],
  ['link', 'background'], ['link', 'sidebar'], ['link', 'muted'],
  ['success', 'background'], ['success', ['success', 0.12, 'background']],
  ['warning', 'background'], ['warning', ['warning', 0.14, 'background']], ['foreground', ['warning', 0.12, 'background']],
  ['destructive', 'background'], ['destructive', ['destructive', 0.1, 'background']],
]
/** Edges that must be seen but are not read: the focus ring, and in dark mode the edge of a control. */
const EDGES: [edge: string, ground: string, modes: ('light' | 'dark')[]][] = [
  ['ring', 'background', ['light', 'dark']], ['ring', 'sidebar', ['light', 'dark']], ['marker', 'canvas', ['light', 'dark']], ['input', 'background', ['dark']],
]

describe.each([['light', light, hoverStrength(LIGHT)], ['dark', darkByChoice, hoverStrength(DARK_BY_CHOICE)]] as const)('colour tokens, %s', (mode, tokens, hover) => {
  const value = (name: string) => {
    expect(tokens[name], `--${name}`).toBeDefined()
    return tokens[name]!
  }
  const ground = (g: Ground) => (typeof g === 'string' ? value(g) : over(value(g[0]), g[1], value(g[2])))

  it.each(TEXT)('%s can be read on %j', (text, on) => {
    expect(contrast(value(text), ground(on))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(EDGES.filter(([, , modes]) => modes.includes(mode)))('%s can be seen on %s', (edge, on) => {
    expect(contrast(value(edge), value(on))).toBeGreaterThanOrEqual(3)
  })

  // `bg-hover` under a ghost button, a menu item or a row: the text on it stays readable, also the muted text.
  it.each(['background', 'sidebar', 'popover'].flatMap((on) => [['foreground', on], ['muted-foreground', on]]))('%s can be read on a hovered item on %s', (text, on) => {
    expect(contrast(value(text!), over(value('foreground'), hover, value(on!)))).toBeGreaterThanOrEqual(4.5)
  })

  it('white text can be read on a filled destructive button', () => {
    // Button and badge: `bg-destructive text-white`, in dark mode `bg-destructive/60`.
    const fill = mode === 'dark' ? over(value('destructive'), 0.6, value('background')) : value('destructive')
    expect(contrast('#ffffff', fill)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('dark mode', () => {
  it('has the same values for the system preference and for the chosen theme', () => {
    expect(darkBySystem).toEqual(darkByChoice)
    expect(hoverStrength(DARK_BY_SYSTEM)).toBe(hoverStrength(DARK_BY_CHOICE))
  })

  it('sets every colour that light mode sets', () => {
    expect(Object.keys(darkByChoice).sort()).toEqual(Object.keys(light).sort())
  })
})

describe('components', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(vue|ts)$/.test(e.name) ? [join(dir, e.name)] : [])
  const PALETTE = /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|divide|shadow|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g
  const HEX = /#[0-9a-fA-F]{6}\b|\[#[0-9a-fA-F]{3,8}\]/g

  it('take every colour from a token: no hex value and no Tailwind palette class', () => {
    const found = files(app).flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return [...text.matchAll(PALETTE), ...text.matchAll(HEX)].map((m) => `${file.slice(app.length)}: ${m[0]}`)
    })
    expect(found).toEqual([])
  })
})
