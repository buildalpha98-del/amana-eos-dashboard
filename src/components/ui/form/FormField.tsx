import type { ReactNode } from "react";
import type { FieldError } from "react-hook-form";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  error?: FieldError;
  children: ReactNode;
}

export function FormField({ label, htmlFor, optional, error, children }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground/80 mb-1">
        {label}
        {optional && (
          <span className="text-muted font-normal"> (optional)</span>
        )}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">{error.message}</p>
      )}
    </div>
  );
}
