import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

// shadcn-vue's variant and size names, so shadcn examples and blocks work as written; the look comes from the tokens
// (tokens.css). Focus is the global :focus-visible ring. Sizes are at least 44px high on touch screens, the touch
// target of the design rules; `sm` and `icon-sm` are smaller only with a mouse (`pointer-coarse`).
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-5',
  {
    variants: {
      variant: {
        /** The main action. One per view. */
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        /** A second action next to the main one. */
        outline: 'border border-input text-foreground hover:bg-accent',
        /** A quiet filled action, for example in a toolbar. */
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        /** An action that deletes or cannot be undone. `text-background` keeps the contrast in both schemes. */
        destructive: 'bg-destructive text-background hover:bg-destructive/90',
        /** Icon buttons and quiet actions, for example in the header. */
        ghost: 'text-foreground hover:bg-accent',
        /** An action that reads as a link. */
        link: 'text-primary underline underline-offset-4 hover:decoration-2',
      },
      size: {
        default: 'h-11 px-5 text-small',
        sm: 'h-9 px-3 text-small pointer-coarse:h-11',
        lg: 'h-12 px-6 text-body',
        icon: 'size-11',
        'icon-sm': 'size-9 pointer-coarse:size-11',
        'icon-lg': 'size-12',
      },
    },
    compoundVariants: [{ variant: 'link', class: 'h-auto px-0' }],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
