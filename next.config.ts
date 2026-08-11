import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets .mdx files be routes (app/blog/foo/page.mdx) or imported as content.
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  // Routes from the retired Maintain Workforce (labour supplier) site. The
  // product pivoted to the Maintain Worker exchange (see PRODUCT.md); old
  // URLs land on the nearest surviving intent.
  async redirects() {
    return [
      { source: "/apply", destination: "/register", permanent: true },
      { source: "/capabilities", destination: "/#how", permanent: true },
      { source: "/testimonials", destination: "/about", permanent: true },
    ];
  },
};

export default createMDX()(nextConfig);
