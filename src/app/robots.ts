import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // /design-system is the internal style guide — served, but not indexed.
    rules: { userAgent: "*", allow: "/", disallow: "/design-system/" },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
