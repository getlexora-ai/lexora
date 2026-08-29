import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/* Pill-shaped, hairline in its own hue, 11.5px semibold — the same object as
   the risk pills so a status badge and a risk badge read as one family. */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap transition-all has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "btn-graphite rounded-4xl",
        secondary: "border-border bg-surface-2 text-text-2",
        destructive:
          "border-risk-high-line bg-risk-high-soft text-risk-high [a]:hover:brightness-110",
        outline: "border-border text-text-2 [a]:hover:bg-surface-2",
        ghost: "hover:bg-surface-2 hover:text-foreground",
        link: "text-brand underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
