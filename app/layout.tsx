import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "../lib/fonts";
import { STORED_THEMES, THEME_STORAGE_KEY } from "../lib/theme";

export const metadata: Metadata = {
  title: "Studio Nova",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: skrypt niżej może ustawić data-theme zanim React przejmie stronę.
    <html lang="pl" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Zapisany motyw ustawiony przed pierwszym malowaniem – bez mignięcia jasnego ekranu. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(STORED_THEMES)}.indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
