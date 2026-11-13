import type { MetadataRoute } from "next";
import { IS_PRODUCTION, SITE_URL } from "@/config/site";

/** Production is crawlable; previews and local builds are not. */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
