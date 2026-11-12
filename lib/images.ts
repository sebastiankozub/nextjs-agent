import type { UIMessage } from "ai";

// Vision: wspólne zasady dla zdjęć (czat, analiza zdjęć dokumentów).
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export function validateImages(messages: UIMessage[]): string | null {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "file") continue;
      if (message.role !== "user") return "Nieprawidłowe zapytanie.";
      if (!IMAGE_TYPES.includes(part.mediaType)) {
        return "Dozwolone są tylko zdjęcia JPG, PNG albo WEBP.";
      }
      // Przyjmujemy tylko zdjęcia wgrane w przeglądarce (data URL), nie linki z internetu.
      const match = /^data:[^;]+;base64,(.*)$/.exec(part.url);
      if (!match) return "Nieprawidłowy format zdjęcia.";
      const bytes = Math.floor((match[1].length * 3) / 4);
      if (bytes > IMAGE_MAX_BYTES) return "Zdjęcie jest za duże (maks. 4 MB).";
    }
  }
  return null;
}
