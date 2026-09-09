import type { IconName } from "@/components/icon";

export type WorkspaceDestination = {
  href: string;
  label: string;
  icon: IconName;
  group: "overview" | "exchange" | "company";
};

// One route map powers both navigation surfaces. Dashboard deliberately uses an
// exact match; the other destinations stay selected on their detail/edit pages.
export const WORKSPACE_NAV: readonly WorkspaceDestination[] = [
  { href: "/app", label: "Dashboard", icon: "i-chart", group: "overview" },
  { href: "/app/workers", label: "Workforce", icon: "i-network", group: "exchange" },
  { href: "/app/capacity", label: "Capacity", icon: "i-speed", group: "exchange" },
  { href: "/app/demand", label: "Requirements", icon: "i-clipboard", group: "exchange" },
  { href: "/app/matches", label: "Matches", icon: "i-cpu", group: "exchange" },
  { href: "/app/engagements", label: "Engagements", icon: "i-check", group: "exchange" },
  { href: "/app/transfers", label: "Transfers", icon: "i-arrow-right", group: "exchange" },
  { href: "/app/settings", label: "Company", icon: "i-shield", group: "company" },
];

export function isWorkspaceDestinationActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/app" && pathname.startsWith(`${href}/`));
}

export function workspaceDestination(pathname: string): WorkspaceDestination | undefined {
  return WORKSPACE_NAV.find((item) => isWorkspaceDestinationActive(pathname, item.href));
}
