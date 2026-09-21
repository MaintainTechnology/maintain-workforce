import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import { assertDeploymentEnvironment } from "./src/lib/deployment-env";

// Next loads environment files before this config. Reject incomplete hosted builds
// here, including deployments that invoke `next build` without an npm lifecycle hook.
// Local and CI fixture builds are unaffected when VERCEL_ENV is not a hosted target.
assertDeploymentEnvironment();

const nextConfig: NextConfig = {
  // Keep multipart overhead below Vercel's request ceiling; the form caps files at 4 MB.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  // Lets .mdx files be routes (app/blog/foo/page.mdx) or imported as content.
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  // Routes from the retired Maintain Workforce (labour supplier) site. The
  // product pivoted to the Maintain Worker exchange (see PRODUCT.md); old
  // URLs land on the nearest surviving intent.
  async redirects() {
    return [
      { source: "/apply", destination: "/signup", permanent: true },
      // The auth screens were renamed to /signin and /signup; the old paths still
      // resolve so existing links and bookmarks do not break.
      { source: "/login", destination: "/signin", permanent: true },
      { source: "/register", destination: "/signup", permanent: true },
      { source: "/capabilities", destination: "/#how", permanent: true },
      { source: "/testimonials", destination: "/about", permanent: true },
    ];
  },
};

export default createMDX()(nextConfig);
