export interface TemplateManifest {
  locales: string[]
  /** Brick key → the date and daterange fields that create-ginko moves to today. */
  shift: Record<string, string[]>
}
export function manifestOf(site: { locales: readonly string[]; bricks: Record<string, unknown> }): TemplateManifest
export function weeksShift(anchor: string, today: string): number
export function addDays(iso: string, days: number): string
export function shiftDates(dir: string, shift: TemplateManifest['shift'], days: number): string[]
export function sampleDates(dir: string, shift: TemplateManifest['shift']): string[]
export function pruneLocales(dir: string, authored: readonly string[], chosen: readonly string[]): void
