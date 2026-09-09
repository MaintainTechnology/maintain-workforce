"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// Auth screens and authenticated workspaces own their navigation and viewport.
// Exact route-family matching keeps marketing pages on their public chrome.
const BARE = [
  "/app",
  "/admin",
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
