import { type ReactNode } from "react";

function extractMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return null;
}

export function FieldError({ errors }: { errors: unknown[] }) {
  const message = extractMessage(errors[0]);
  if (!message) return null;
  return <p className="text-xs text-[#fca5a5]">{message}</p>;
}

export function FormField({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: ReactNode;
}) {
  return (
    <label className="text-text-muted flex flex-col gap-1 text-xs">
      {label}
      {children}
      {error}
    </label>
  );
}
