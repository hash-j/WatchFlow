import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type SelectProps = React.ComponentProps<"select"> & {
  containerClassName?: string;
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, children, ...props }, ref) => (
    <span
      data-slot="select-wrapper"
      className={cn("relative block w-full min-w-0 max-w-full", containerClassName)}
    >
      <select
        ref={ref}
        data-slot="select"
        className={cn(
          "peer min-h-11 w-full min-w-0 max-w-full appearance-none rounded-lg border border-input bg-surface py-2 pl-3 pr-10 text-base text-foreground shadow-none transition-[border-color,box-shadow,background-color] duration-150 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/15 md:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        data-slot="select-chevron"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors peer-focus-visible:text-foreground peer-disabled:opacity-50"
        aria-hidden="true"
        focusable="false"
      />
    </span>
  ),
);
Select.displayName = "Select";

export { Select };
