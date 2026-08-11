import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Marketing routes only. The company workspace and admin surfaces ship
// noindex when they arrive (build spec §13.9).
const ROUTES: { path: string; priority: number }[] = [
  { path: "", priority: 1 },
  { path: "/register", priority: 0.9 },
  { path: "/about", priority: 0.7 },
  { path: "/contact", priority: 0.6 },
  { path: "/login", priority: 0.3 },
  { path: "/forgot-password", priority: 0.1 },
  { path: "/legal/privacy", priority: 0.2 },
  { path: "/legal/terms", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority }) => ({
    url: `${site.url}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority,
  }));
}
