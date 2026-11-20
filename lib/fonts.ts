// Kroje pisma motywów (next/font – część Next.js, pliki serwowane z naszej domeny).
// Każdy krój to zmienna CSS; motyw w globals.css wybiera, których użyć.
// preload tylko dla domyślnego Inter – pozostałe pobiera przeglądarka dopiero, gdy motyw ich użyje.
import {
  Cormorant_Garamond,
  Fraunces,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  Lora,
  Manrope,
  Nunito,
  Source_Sans_3,
} from "next/font/google";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-fraunces", display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin", "latin-ext"], variable: "--font-nunito", display: "swap", preload: false });
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
  preload: false,
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
});
const lora = Lora({ subsets: ["latin", "latin-ext"], variable: "--font-lora", display: "swap", preload: false });
const sourceSans = Source_Sans_3({ subsets: ["latin", "latin-ext"], variable: "--font-source-sans", display: "swap", preload: false });
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});
const manrope = Manrope({ subsets: ["latin", "latin-ext"], variable: "--font-manrope", display: "swap", preload: false });

export const fontVariables = [
  inter,
  fraunces,
  nunito,
  plexSans,
  plexMono,
  lora,
  sourceSans,
  cormorant,
  manrope,
]
  .map((font) => font.variable)
  .join(" ");
