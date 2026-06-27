import type { MetadataRoute } from "next";

// PWA manifest (spec §9.1). Next serves this at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bai Spots",
    short_name: "Bai Spots",
    description: "curated cebu low-key spots ni bro",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0a0d",
    theme_color: "#0c0a0d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
