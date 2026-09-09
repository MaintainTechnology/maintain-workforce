"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { BTN_GHOST, BTN_PRIMARY, PANEL } from "@/lib/ui";

export default function WorkspaceError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className={`${PANEL} max-w-2xl p-(--space-5) sm:p-(--space-7)`}>
      <Icon name="i-network" className="mb-(--space-5) size-8 text-teal-mist" />
      <h1 className="text-h2 font-bold">This page couldn’t be loaded</h1>
      <p className="mt-(--space-3) text-body text-on-dark-muted">
        Try again, or use the workspace navigation to open another area.
      </p>
      <div className="mt-(--space-5) flex flex-wrap gap-(--space-3)">
        <button type="button" onClick={() => retry()} className={BTN_PRIMARY}>Try again</button>
        <Link href="/app" className={BTN_GHOST}>Back to dashboard</Link>
      </div>
    </section>
  );
}
