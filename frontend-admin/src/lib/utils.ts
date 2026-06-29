import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function userLabel(u: {
  id: string;
  displayName?: string | null;
  email?: string | null;
}): string {
  const who = u.displayName || u.email || u.id;
  return u.email && u.email !== who ? `${who} (${u.email})` : who;
}

export function confirmAction(message: string): boolean {
  return window.confirm(message);
}

export function promptText(message: string, defaultValue = ""): string | null {
  return window.prompt(message, defaultValue);
}
