import * as React from "react";

import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  no3d?: boolean;
}

const CARD_GLASS =
  "rounded-3xl border border-white/10 dark:border-white/[0.08] bg-card/65 dark:bg-white/[0.04] text-card-foreground shadow-[0_12px_40px_-16px_hsl(220_40%_4%/0.25)] dark:shadow-[0_20px_60px_-20px_hsl(220_60%_2%/0.6)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/55 dark:supports-[backdrop-filter]:bg-white/[0.04] h-full transition-all duration-300";


const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, no3d, ...props }, ref) => {
  if (no3d) {
    return <div ref={ref} className={cn(CARD_GLASS, className)} {...props} />;
  }
  return (
    <div className="card-3d h-full">
      <div ref={ref} className={cn("card-3d-inner", CARD_GLASS, className)} {...props} />
    </div>
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
