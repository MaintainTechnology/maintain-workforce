import type { IconName } from "@/components/icon";

export type AdminDestination = {
  href: string;
  label: string;
  icon: IconName;
  group: "Operations" | "Records" | "Configuration";
};

// One route map for the admin sidebar, the mobile disclosure and the top-bar
// breadcrumb. MVP has one maintain_admin role, so every admin sees the same
// destinations: the working queues first, the registers, then reference data.
export const ADMIN_NAV: readonly AdminDestination[] = [
  { href: "/admin", label: "Dashboard", icon: "i-chart", group: "Operations" },
  { href: "/admin/leads", label: "Leads", icon: "i-phone", group: "Operations" },
  { href: "/admin/verification", label: "Account approvals", icon: "i-shield", group: "Operations" },
  { href: "/admin/matching", label: "Matching", icon: "i-cpu", group: "Operations" },
  { href: "/admin/engagements", label: "Engagements", icon: "i-check", group: "Operations" },
  { href: "/admin/transfers", label: "Transfers", icon: "i-arrow-right", group: "Operations" },
  { href: "/admin/notifications", label: "Notifications", icon: "i-mail", group: "Operations" },
  { href: "/admin/companies", label: "Companies", icon: "i-network", group: "Records" },
  { href: "/admin/workers", label: "Workers", icon: "i-clipboard", group: "Records" },
  { href: "/admin/catalogue", label: "Catalogue", icon: "i-star", group: "Configuration" },
  { href: "/admin/rates", label: "Rates and fees", icon: "i-speed", group: "Configuration" },
];

export function isAdminDestinationActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

export function adminDestination(pathname: string): AdminDestination | undefined {
  return ADMIN_NAV.find((item) => isAdminDestinationActive(pathname, item.href));
}

/** The second breadcrumb for a detail route beneath a destination. */
export function adminDetailLabel(pathname: string): string | undefined {
  if (/^\/admin\/companies\/[^/]+\/concierge/.test(pathname)) return "Concierge entry";
  if (/^\/admin\/matching\/[^/]+/.test(pathname)) return "Candidates";
  if (/^\/admin\/engagements\/[^/]+/.test(pathname)) return "Engagement controls";
  return undefined;
}
