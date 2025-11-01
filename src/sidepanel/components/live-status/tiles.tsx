import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusLinkProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  value: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  withBorder?: boolean;
  emphasis?: "default" | "muted";
}

export const StatusLink = forwardRef<HTMLButtonElement, StatusLinkProps>(
  ({ label, value, description, icon, disabled, withBorder = false, emphasis = "default", className, ...props }, ref) => {
    const valueClasses =
      emphasis === "muted"
        ? "text-sm text-muted-foreground"
        : "text-base text-foreground";
    return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors",
        withBorder ? "border border-border" : undefined,
        disabled
          ? "cursor-default"
          : "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className
      )}
      disabled={disabled}
      {...props}
    >
      <span className="flex items-start gap-3">
        {icon ? <span className="text-muted-foreground mt-1.5">{icon}</span> : null}
        <span className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className={valueClasses}>{value}</span>
          {description ? (
            <span className="text-xs text-muted-foreground/80 leading-tight">
              {description}
            </span>
          ) : null}
        </span>
      </span>
      {!disabled && <ArrowUpRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
});

StatusLink.displayName = "StatusLink";
