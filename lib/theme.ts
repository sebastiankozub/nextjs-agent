// Motywy wyglądu Studio Nova. Wspólne dla listy wyboru (app/theme-picker.tsx)
// i skryptu w layout.tsx, który ustawia zapisany motyw przed pierwszym malowaniem.
export const THEME_STORAGE_KEY = "studio-nova-theme";

// "auto" = Nova jasny/ciemny zgodnie z systemem (brak data-theme na <html>).
export const THEMES = [
  { value: "auto", label: "Systemowy" },
  { value: "light", label: "Jasny" },
  { value: "dark", label: "Ciemny" },
  { value: "cafe", label: "Ciepła kawiarnia" },
  { value: "tech", label: "Techniczny i surowy" },
  { value: "cabinet", label: "Spokojny gabinet" },
  { value: "library", label: "Nocna biblioteka" },
  { value: "nordic", label: "Nordycki poranek" },
] as const;

export type Theme = (typeof THEMES)[number]["value"];

export const STORED_THEMES: string[] = THEMES.filter((t) => t.value !== "auto").map((t) => t.value);
