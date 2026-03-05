import type { ReactNode } from "react";
import type { FieldError } from "react-hook-form";

interface FormFieldProps {
  label: string;
  optional?: boolean;
  error?: FieldError;
  children: ReactNode;
}

export function FormField({ label, optional, error, children }: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {optional && (
          <span className="text-gray-400 font-normal"> (optional)</span>
        )}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error.message}</p>
      )}
    </div>
  );
}
