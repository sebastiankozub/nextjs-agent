"use client";

import { useEffect, useState } from "react";
import { STORED_THEMES, THEME_STORAGE_KEY, THEMES, type Theme } from "../lib/theme";

// Lista wyboru wyglądu. Wybór zapamiętany w localStorage; „Systemowy” usuwa zapis.
function readStored(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value && STORED_THEMES.includes(value) ? (value as Theme) : "auto";
  } catch {
    return "auto";
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export default function ThemePicker() {
  const [theme, setTheme] = useState<Theme>("auto");

  // Na serwerze localStorage nie istnieje – zapisany wybór odczytujemy po załadowaniu.
  useEffect(() => {
    setTheme(readStored());
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
    try {
      if (next === "auto") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Brak dostępu do pamięci przeglądarki (np. tryb prywatny) – motyw działa do odświeżenia.
    }
  }

  return (
    <label className="theme-picker" title="Wygląd aplikacji">
      <span className="theme-picker-icon" aria-hidden="true">
        ◐
      </span>
      <span className="sr-only">Wygląd</span>
      <select value={theme} onChange={(event) => choose(event.target.value as Theme)}>
        {THEMES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
