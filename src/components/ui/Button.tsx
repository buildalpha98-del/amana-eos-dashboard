import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// ─── Variant & Size Maps ────────────────────────────────────

const variantStyles = {
  primary:
    "bg-[#004E64] text-white hover:bg-[#003D52] focus-visible:ring-[#004E64]/50",
  secondary:
    "border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus-visible:ring-gray-300",
  outline:
    "border border-[#004E64] text-[#004E64] bg-white hover:bg-[#004E64]/5 focus-visible:ring-[#004E64]/50",
  ghost:
    "text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-gray-300",
  destructive:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/50",
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
          "inline-flex items-center justify-center font-medium rounded-lg transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
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
