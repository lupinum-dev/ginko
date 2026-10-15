// Synced from templates/_features/ui/app/components/ui/badge/index.ts by `pnpm templates sync`. Edit the source, not this copy.
import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

// Trimmed from shadcn-vue. A badge states a status with a word, never with its colour alone.
export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5',
  {
    variants: {
      variant: {
        secondary: 'border-transparent bg-muted text-foreground',
        outline: 'text-foreground',
        primary: 'border-transparent bg-primary text-primary-foreground',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
