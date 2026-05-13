import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 min-h-[44px] w-full rounded-2xl border border-white/10 dark:border-white/[0.08] bg-background/40 dark:bg-white/[0.04] backdrop-blur-md px-4 py-0 text-base leading-[1.2] align-middle ring-offset-background transition-all duration-300 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground placeholder:leading-[1.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:border-primary/40 focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.12),0_0_24px_-8px_hsl(var(--primary)/0.5)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm touch-manipulation",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
