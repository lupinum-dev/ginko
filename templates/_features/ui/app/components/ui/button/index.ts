import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

// Trimmed from shadcn-vue: the variants and sizes of DESIGN.md only. Focus is the global :focus-visible ring
// (tokens.css). Every size is at least 44px high, the touch target of the design rules.
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-5',
  {
    variants: {
      variant: {
        /** The main action. One per view. */
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        /** A second action next to the primary one. */
        secondary: 'border border-input text-foreground hover:bg-accent',
        /** Icon buttons and quiet actions, for example in the header. */
        ghost: 'text-foreground hover:bg-accent',
        /** An action that reads as a link. */
        link: 'text-primary underline underline-offset-4 hover:decoration-2',
      },
      size: {
        md: 'h-11 px-5 text-small',
        lg: 'h-12 px-6 text-body',
        icon: 'size-11',
      },
    },
    compoundVariants: [{ variant: 'link', class: 'h-auto px-0' }],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
