import type { UseFormRegisterReturn } from "react-hook-form";

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  registration: UseFormRegisterReturn;
  hasError?: boolean;
}

export function FormSelect({ registration, hasError, className, children, ...props }: FormSelectProps) {
  return (
    <select
      {...registration}
      {...props}
      className={`w-full px-3 py-2 border rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent ${
        hasError ? "border-red-300" : "border-gray-300"
      } ${className ?? ""}`}
    >
      {children}
    </select>
  );
}
