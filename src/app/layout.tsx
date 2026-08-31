import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SiteChromeFooter, SiteChromeHeader } from "@/components/site-chrome";
import { site } from "@/lib/site";
import "./globals.css";

// The Hi-Vis Standard has one family: Manrope, the group brand's own face,
// display 700-800 and body 400-600. Self-hosted via next/font: no layout
// shift, no third-party request. (The reference build spec's three-family
// stack was content-source only; DESIGN.md overrules it.)

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.name,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  openGraph: {
    title: site.name,
    description: site.description,
    url: site.url,
    siteName: site.name,
    type: "website",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.description,
  },
};

// The brand is dark-locked from header to footer (DESIGN.md Dark Lock Rule),
// so the page has to say so to the browser as well as to the reader.
// colorScheme paints native scrollbars, form controls and autofill dark
// instead of leaving light-mode chrome on an Ink Teal page; themeColor
// carries Ink Teal into the mobile browser bar so the surface does not stop
// at the viewport edge.
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07272D",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <SiteChromeHeader />
          {children}
          <SiteChromeFooter />
        </ClerkProvider>
        {/* Both no-op unless deployed on Vercel. Delete if hosting elsewhere. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
