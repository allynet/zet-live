const API_URL_KEY = "admin_api_url";
const API_KEY = "admin_key";

export interface Credentials {
  apiUrl: string;
  apiKey: string;
}

const DEFAULT_API_URL = (import.meta.env.VITE_ADMIN_API_URL as string | undefined) ?? "/api";

export function getCredentials(): Credentials | null {
  const apiUrl = localStorage.getItem(API_URL_KEY) ?? DEFAULT_API_URL;
  const apiKey = localStorage.getItem(API_KEY);
  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey };
}

export function setCredentials(creds: Credentials): void {
  localStorage.setItem(API_URL_KEY, creds.apiUrl);
  localStorage.setItem(API_KEY, creds.apiKey);
}

export function clearCredentials(): void {
  localStorage.removeItem(API_KEY);
}

export function defaultApiUrl(): string {
  return DEFAULT_API_URL;
}
