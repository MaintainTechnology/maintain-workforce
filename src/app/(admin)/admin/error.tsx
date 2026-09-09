"use client";

import Link from "next/link";
import { BTN_GHOST, BTN_PRIMARY, PANEL } from "@/lib/ui";

export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className={`${PANEL} max-w-2xl p-(--space-6)`}>
      <h1 className="text-h2 font-bold">This page couldn’t be loaded</h1>
      <p className="mt-(--space-3) text-on-dark-muted">Try again to load the latest records. You can also use the admin navigation to open another area.</p>
      <div className="mt-(--space-5) flex flex-wrap gap-(--space-3)">
        <button type="button" className={BTN_PRIMARY} onClick={() => retry()}>Try again</button>
        <Link href="/admin" className={BTN_GHOST}>Back to marketplace</Link>
      </div>
    </section>
  );
}
