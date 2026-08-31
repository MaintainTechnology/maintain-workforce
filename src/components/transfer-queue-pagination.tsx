import Link from "next/link";
import { transferPageHref, type TransferPage, type TransferSearchParams } from "@/lib/transfer-queue";
import { BTN_GHOST } from "@/lib/ui";

export function TransferQueuePagination({
  pathname, search, pagination, shown,
}: {
  pathname: "/app/transfers" | "/admin/transfers";
  search: TransferSearchParams;
  pagination: TransferPage;
  shown: number;
}) {
  return (
    <nav aria-label="Transfer pages" className="flex flex-wrap items-center justify-between gap-(--space-3)">
      <p className="text-body-sm text-on-dark-muted">Page {pagination.page} · {shown} shown</p>
      <div className="flex flex-wrap gap-(--space-3)">
        {pagination.hasPrevious ? (
          <>
            <Link className={BTN_GHOST} href={transferPageHref(pathname, search, 1)}>Newest requests</Link>
            <Link className={BTN_GHOST} href={transferPageHref(pathname, search, pagination.page - 1)}>Previous page</Link>
          </>
        ) : null}
        {pagination.hasNext ? (
          <Link className={BTN_GHOST} href={transferPageHref(pathname, search, pagination.page + 1)}>Next page</Link>
        ) : null}
      </div>
    </nav>
  );
}
