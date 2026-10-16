import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge, told about the theme of tokens.css. Without it, `text-small` reads as a colour and `p-gutter` or
 * `max-w-page` as unknown, so a conflicting class would not replace the component's own.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['h1', 'h2', 'h3', 'lead', 'body', 'small', 'xs'],
      font: ['display'],
      radius: ['block'],
      shadow: ['overlay'],
      spacing: ['section', 'gutter'],
      container: ['page', 'prose'],
    },
  },
})

/** Joins class names (strings, arrays, `{ class: condition }`); a later class wins over a conflicting earlier one. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
