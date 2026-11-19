import type { MetadataRoute } from "next";

/**
 * Web app manifest: "add to home screen" (option 2, approved by the user 19.11, docs/DECISIONS.md).
 * Installed, the club opens on /me in its own window (/me sends a signed-out member to /login
 * first). Android builds its opening screen from background_color, the icon and the name.
 *
 * The icons are stand-ins cut from design/home-screen/assets/icon-2.png; the designer makes the
 * final sizes (WORK-BOARD, part 2).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/me",
    name: "TAU AI Club",
    short_name: "TAU AI Club",
    description: "Tel Aviv University's AI club",
    lang: "he",
    dir: "rtl",
    start_url: "/me",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#241163",
    theme_color: "#0b0a1f",
    icons: [
      { src: "/home-screen/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/home-screen/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
