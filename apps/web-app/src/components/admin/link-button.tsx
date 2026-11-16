import type { ComponentProps, ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import type { VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { buttonVariants } from "../ui/button"

// A navigation action that looks like a button but stays a link (DEC-236): Base UI `Button` with `render={<Link />}`
// stamps `role="button"` on the anchor, so screen readers (and `getByRole("link")`) lose the link. Use this instead.
type Variants = VariantProps<typeof buttonVariants>

export function LinkButton({ variant = "default", size = "default", className, ...props }: ComponentProps<typeof Link> & Variants & { className?: string }) {
  return <Link data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

/** Same for a plain URL (downloads, server routes). */
export function AnchorButton({ variant = "default", size = "default", className, children, ...props }: ComponentProps<"a"> & Variants & { children: ReactNode }) {
  return (
    <a data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </a>
  )
}
