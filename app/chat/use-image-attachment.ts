"use client";

import { useRef, useState, type ChangeEvent } from "react";

// Vision: dozwolone formaty i limit (te same zasady sprawdza serwer).
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const IMAGE_TYPES = IMAGE_ACCEPT.split(",");
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Zdjęcie dołączone do wiadomości – sprawdzane od razu w przeglądarce, zły plik nie leci na serwer. */
export function useImageAttachment() {
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearImage() {
    setImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setImageError(null);
    if (!file) return clearImage();
    if (!IMAGE_TYPES.includes(file.type)) {
      setImageError("Dozwolone są tylko zdjęcia JPG, PNG albo WEBP.");
      return clearImage();
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setImageError("Zdjęcie jest za duże (maks. 4 MB).");
      return clearImage();
    }
    setImage(file);
  }

  /** Pliki do wysłania przez useChat (zamienia je na data URL) albo null. */
  const files = () => (image && fileInputRef.current?.files ? fileInputRef.current.files : null);

  function reset() {
    clearImage();
    setImageError(null);
  }

  return { image, imageError, fileInputRef, handleFileChange, clearImage, files, reset };
}

export type ImageAttachment = ReturnType<typeof useImageAttachment>;
