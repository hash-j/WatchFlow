import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WatchFlow",
    short_name: "WatchFlow",
    description: "A private workspace for organizing what you want to watch.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#121212",
    theme_color: "#121212",
    orientation: "any",
    categories: ["entertainment", "lifestyle"],
    icons: [
      {
        src: "/icons/watchflow-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/watchflow-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/watchflow-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
