"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
<<<<<<< HEAD
import { useDismissableDetails } from "@/components/use-dismissable-details";
=======
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba
import { WorkspaceViewSwitch } from "@/components/workspace-view-switch";
import type { CompanyStatus } from "@/lib/supabase/types";
import { NAV_FOCUS } from "@/lib/ui";
import {
  WORKSPACE_NAV,
  isWorkspaceDestinationActive,
  workspaceDestination,
} from "@/lib/workspace-navigation";

type WorkspaceAccount = {
  companyName: string;
  companyStatus: CompanyStatus;
  email: string;
  canManageWorkforce?: boolean;
  signOut: ReactNode;
};

const STATUS_DOT: Record<CompanyStatus, string> = {
  Active: "bg-status-active",
  Pending: "bg-status-pending",
  Suspended: "bg-status-critical",
  Closed: "bg-on-dark-faint",
};

function CompanyState({ status }: { status: CompanyStatus }) {
  return (
    <span className="inline-flex items-center gap-2 text-overline font-semibold uppercase tracking-(--tracking-caps) text-on-dark-muted">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>
  );
}

function CompanyIdentity({ companyName, companyStatus }: Pick<WorkspaceAccount, "companyName" | "companyStatus">) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) border border-hairline bg-white/5 text-sm font-bold text-on-dark">
        {companyName.trim().slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-on-dark" title={companyName}>{companyName}</p>
        <CompanyState status={companyStatus} />
      </div>
    </div>
  );
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Workspace">
      <ul className="space-y-1">
        {WORKSPACE_NAV.map((item, index) => {
          const selected = isWorkspaceDestinationActive(pathname, item.href);
          const startsGroup = index > 0 && item.group !== WORKSPACE_NAV[index - 1].group;

          return (
            <li key={item.href} className={startsGroup ? "mt-4 border-t border-hairline pt-4" : undefined}>
              <Link
                href={item.href}
                aria-current={selected ? "page" : undefined}
                onNavigate={onNavigate}
                onClick={(event) => {
                  // A link to the current page does not change the pathname, but
                  // should still dismiss the disclosure after a regular click.
                  if (selected && pathname === item.href && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                    onNavigate?.();
                  }
                }}
                className={`group flex min-h-11 items-center gap-3 rounded-(--radius-md) border px-3 py-2.5 text-sm font-semibold transition-colors duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none ${NAV_FOCUS} ${selected
                  ? "border-hairline bg-white/[0.07] text-on-dark"
                  : "border-transparent text-on-dark-muted hover:bg-white/5 hover:text-on-dark active:bg-white/10"}`}
              >
                <Icon name={item.icon} className={`size-[18px] shrink-0 ${selected ? "text-teal-mist" : "text-on-dark-faint group-hover:text-on-dark-muted"}`} />
                <span>{item.label}</span>
                {selected && <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-teal-mist" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AccountFooter({ email, signOut, canManageWorkforce }: Pick<WorkspaceAccount, "email" | "signOut" | "canManageWorkforce">) {
  return (
    <div className="border-t border-hairline pt-4">
      <p className="text-xs text-on-dark-faint">Signed in as</p>
      <p className="mt-1 truncate text-sm font-medium text-on-dark-muted" title={email}>{email}</p>
      {canManageWorkforce && (
        <Link href="/admin" className={`mt-3 flex min-h-11 items-center justify-center rounded-(--radius-pill) border border-hairline px-4 text-sm font-semibold text-on-dark hover:bg-white/5 ${NAV_FOCUS}`}>
          Switch to admin view
        </Link>
      )}
      <div className="mt-3">{signOut}</div>
    </div>
  );
}

export function WorkspaceSidebar(account: WorkspaceAccount) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-hairline bg-teal-deep lg:flex">
      <div className="flex h-[68px] shrink-0 items-center border-b border-hairline px-6">
        <Link href="/app" aria-label="Maintain Workforce dashboard" className={`inline-flex min-h-11 items-center ${NAV_FOCUS}`}>
          <Image src="/design-system/assets/logo/wordmark-on-dark.svg" alt="Maintain Workforce" width={170} height={36} priority className="h-8 w-auto" />
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-5 pt-6">
        <div className="mb-7 px-2"><CompanyIdentity {...account} /></div>
        <NavigationLinks />
        <div className="mt-auto pt-8"><AccountFooter {...account} /></div>
      </div>
    </aside>
  );
}

function MobileNavigation(account: WorkspaceAccount) {
  const { detailsRef, summaryRef, close } = useDismissableDetails();

  return (
    <details ref={detailsRef} className="group relative shrink-0 lg:hidden">
      <summary ref={summaryRef} aria-label="Workspace menu" className={`flex size-11 cursor-pointer list-none items-center justify-center rounded-(--radius-pill) border border-hairline text-on-dark transition-colors hover:bg-white/5 active:bg-white/10 group-open:bg-white/10 [&::-webkit-details-marker]:hidden ${NAV_FOCUS}`}>
        <Icon name="i-menu" />
      </summary>
      <div className="mw-menu-panel absolute right-0 top-[calc(100%+0.75rem)] max-h-[calc(100dvh-88px)] w-[min(320px,calc(100vw-32px))] overflow-y-auto rounded-(--radius-lg) border border-hairline bg-black-2 p-4 shadow-(--shadow-lg)">
        <div className="mb-5 px-2"><CompanyIdentity {...account} /></div>
        <NavigationLinks onNavigate={() => close(true)} />
        <div className="mt-5"><AccountFooter {...account} /></div>
      </div>
    </details>
  );
}

export function WorkspaceHeader(account: WorkspaceAccount) {
  const pathname = usePathname();
  const destination = workspaceDestination(pathname);

  return (
    <header className="sticky top-0 z-(--z-sticky) border-b border-hairline bg-ink-teal/95 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] w-full max-w-[1200px] items-center justify-between gap-4 px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <Link href="/app" aria-label="Maintain Workforce dashboard" className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center lg:hidden ${NAV_FOCUS}`}>
            <Image src="/design-system/assets/logo/mark.svg" alt="Maintain Workforce" width={36} height={23} priority className="h-auto w-9" />
          </Link>
          <span className="hidden shrink-0 text-on-dark-faint lg:inline">User view</span>
          <span aria-hidden="true" className="hidden text-on-dark-faint lg:inline">/</span>
          <span className="truncate font-semibold text-on-dark">{destination?.label ?? "Workspace"}</span>
          {destination && pathname !== destination.href && (
            <span className="hidden text-on-dark-faint sm:inline">/ {pathname.endsWith("/new") ? "New" : "Details"}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {account.canManageWorkforce ? (
            <WorkspaceViewSwitch view="user" />
          ) : (
            <span className="hidden text-xs font-medium text-on-dark-faint lg:block">Company workspace</span>
          )}
          <MobileNavigation {...account} />
        </div>
      </div>
    </header>
  );
}
