import type { UseFormRegisterReturn } from "react-hook-form";

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  registration: UseFormRegisterReturn;
  hasError?: boolean;
}

export function FormInput({ registration, hasError, className, ...props }: FormInputProps) {
  return (
    <input
      {...registration}
      {...props}
      className={`w-full px-3 py-2 border rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent ${
        hasError ? "border-red-300" : "border-gray-300"
      } ${className ?? ""}`}
    />
  );
}
