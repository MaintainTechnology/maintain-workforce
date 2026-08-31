"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// The auth screens own the whole viewport: they carry their own logo and their own
// footer line, so the marketing header and footer would only duplicate them. Everything
// else on the site keeps the standard chrome.
const BARE = [
  "/signin",
  "/signup",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
  "/accept-invitation",
];

function isBare(pathname: string): boolean {
  return BARE.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

export function SiteChromeHeader() {
  return isBare(usePathname()) ? null : <SiteHeader />;
}

export function SiteChromeFooter() {
  return isBare(usePathname()) ? null : <SiteFooter />;
}
