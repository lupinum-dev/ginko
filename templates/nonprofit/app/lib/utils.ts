// Synced from templates/_features/ui/app/lib/utils.ts by `pnpm templates sync`. Edit the source, not this copy.
import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'

/**
 * Joins class names (strings, arrays, `{ class: condition }`). It does not resolve conflicts the way shadcn's
 * tailwind-merge does: that library costs about 8 kB of JavaScript on every page, more than the budget of the
 * templates leaves (DESIGN.md, "Components"). So a component's `class` prop only adds classes; to change a class a
 * component sets, change the component.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
