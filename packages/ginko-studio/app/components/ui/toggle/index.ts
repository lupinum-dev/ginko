import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Toggle } from "./Toggle.vue"

export const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-hover disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/80 focus-visible:ring-3 outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent",
        // Items on a muted track (ToggleGroup variant="segmented"), the chosen one lifted. In dark mode the chosen
        // item is lighter than the track: the page is darker than the track, so it would read as a hole.
        segmented:
          "bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs dark:data-[state=on]:bg-input/40",
      },
      size: {
        default: "h-9 px-2 min-w-9",
        sm: "h-8 px-1.5 min-w-8",
        lg: "h-10 px-2.5 min-w-10",
      },
    },
    // A segmented item is 3 px smaller on each side than a button of that size: the track adds them back.
    compoundVariants: [
      { variant: "segmented", size: "default", class: "h-[30px] min-w-[30px] text-[13px]" },
      { variant: "segmented", size: "sm", class: "h-[26px] min-w-[26px] text-[13px]" },
      { variant: "segmented", size: "lg", class: "h-[34px] min-w-[34px]" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export type ToggleVariants = VariantProps<typeof toggleVariants>
