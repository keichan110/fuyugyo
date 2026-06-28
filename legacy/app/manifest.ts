import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "fuyugyo",
    short_name: "fuyugyo",
    description: "fuyugyo",
    start_url: "/",
    display: "standalone",
    theme_color: "#fff",
    background_color: "#fff",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
