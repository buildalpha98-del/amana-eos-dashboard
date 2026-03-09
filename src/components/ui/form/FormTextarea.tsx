import type { UseFormRegisterReturn } from "react-hook-form";

interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  registration: UseFormRegisterReturn;
  hasError?: boolean;
}

export function FormTextarea({ registration, hasError, className, id, ...props }: FormTextareaProps) {
  return (
    <textarea
      id={id ?? registration.name}
      {...registration}
      {...props}
      aria-invalid={hasError || undefined}
      className={`w-full px-3 py-2 border rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none ${
        hasError ? "border-red-300" : "border-gray-300"
      } ${className ?? ""}`}
    />
  );
}
