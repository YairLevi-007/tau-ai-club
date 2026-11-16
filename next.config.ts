import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: next-intl's static rendering is
  // proven on the classic model (`revalidate` + setRequestLocale). See CLAUDE.md.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Profile photos (up to 2 MB) go through a Server Action; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default withNextIntl(nextConfig);
