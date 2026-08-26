import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const feedbackStyles = {
  info: {
    icon: Info,
    classes: "border-primary/20 bg-primary/5 text-foreground",
    iconClasses: "text-primary",
  },
  success: {
    icon: CheckCircle2,
    classes: "border-success/25 bg-success/10 text-foreground",
    iconClasses: "text-success",
  },
  warning: {
    icon: TriangleAlert,
    classes: "border-warning/30 bg-warning/10 text-foreground",
    iconClasses: "text-warning",
  },
  error: {
    icon: AlertCircle,
    classes: "border-destructive/25 bg-destructive/10 text-foreground",
    iconClasses: "text-destructive",
  },
} as const;

export function Feedback({
  variant = "info",
  title,
  children,
  icon,
  className,
  role,
}: {
  variant?: keyof typeof feedbackStyles;
  title?: React.ReactNode;
  children: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
  role?: "alert" | "status";
}) {
  const styles = feedbackStyles[variant];
  const Icon = icon ?? styles.icon;

  return (
    <div
      className={cn(
        "flex min-w-0 gap-3 rounded-xl border p-4 text-sm leading-6",
        styles.classes,
        className,
      )}
       role={role ?? (variant === "error" ? "alert" : "status")}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", styles.iconClasses)}
        aria-hidden="true"
      />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-0.5 text-muted-foreground")}>
          {children}
        </div>
      </div>
    </div>
  );
}
