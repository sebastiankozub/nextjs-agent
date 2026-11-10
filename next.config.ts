import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tylko tryb dev: pozwala otwierać stronę z innego urządzenia w sieci
  // domowej (adres "Network" z terminala). Nie wpływa na Vercel.
  allowedDevOrigins: ["192.168.0.11"],
};

export default nextConfig;
