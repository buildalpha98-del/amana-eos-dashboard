import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// ─── Variant & Size Maps ────────────────────────────────────

const variantStyles = {
  primary:
    "bg-brand text-white hover:bg-brand-hover focus-visible:ring-brand/50 shadow-[var(--shadow-warm-sm)] hover:shadow-[var(--shadow-warm)] active:scale-[0.98] transition-all duration-200",
  secondary:
    "border border-border text-foreground bg-white hover:bg-surface focus-visible:ring-gray-300",
  outline:
    "border border-brand text-brand bg-white hover:bg-brand/8 hover:shadow-[var(--shadow-warm-sm)] focus-visible:ring-brand/50",
  ghost:
    "text-muted hover:bg-surface hover:text-foreground focus-visible:ring-gray-300",
  destructive:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/50 shadow-sm hover:shadow-md",
} as const;

const sizeStyles = {
  xs: "px-2 py-1 text-xs gap-1",
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-4 py-2.5 text-sm gap-2",
} as const;

// ─── Props ──────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  /** Show a Loader2 spinner and disable the button */
  loading?: boolean;
  /** Icon element rendered before children */
  iconLeft?: ReactNode;
  /** Icon element rendered after children */
  iconRight?: ReactNode;
}

// ─── Component ──────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      iconLeft,
      iconRight,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center font-medium tracking-wide rounded-xl transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          // Variant
          variantStyles[variant],
          // Size
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : iconLeft ? (
          iconLeft
        ) : null}
        {children}
        {!loading && iconRight}
      </button>
    );
  }
);

Button.displayName = "Button";
