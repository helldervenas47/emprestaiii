import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation active:scale-[0.97] active:opacity-90 relative after:absolute after:inset-[-4px] after:content-[''] md:after:hidden ripple-touch",
  {
    variants: {
      variant: {
        default: "btn-gradient-hover btn-gradient-hover--primary bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.55)] hover:shadow-[0_12px_32px_-8px_hsl(var(--primary)/0.75)]",
        destructive: "btn-gradient-hover btn-gradient-hover--destructive bg-destructive text-destructive-foreground shadow-[0_8px_24px_-8px_hsl(var(--destructive)/0.55)] hover:shadow-[0_12px_32px_-8px_hsl(var(--destructive)/0.75)]",
        outline: "btn-sweep-hover border border-white/15 dark:border-white/[0.08] bg-white/5 dark:bg-white/[0.04] backdrop-blur-md hover:bg-white/10 dark:hover:bg-white/[0.08]",
        secondary: "bg-secondary/70 text-secondary-foreground backdrop-blur-md border border-white/10 hover:bg-secondary/90",
        ghost: "hover:bg-white/10 dark:hover:bg-white/[0.06] hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        success: "btn-gradient-hover btn-gradient-hover--success bg-success text-success-foreground shadow-[0_8px_24px_-8px_hsl(var(--success)/0.55)] hover:shadow-[0_12px_32px_-8px_hsl(var(--success)/0.75)]",
      },
      size: {
        default: "h-11 px-4 py-2 min-h-[44px]",
        sm: "h-10 rounded-md px-3 min-h-[40px]",
        lg: "h-12 rounded-md px-8 min-h-[48px]",
        icon: "h-11 w-11 min-h-[44px] min-w-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
