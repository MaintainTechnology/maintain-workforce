import Link from "next/link";
import { Icon } from "@/components/icon";
import { transferPageHref, type TransferPage, type TransferSearchParams } from "@/lib/transfer-queue";
import { BTN_GHOST_SM } from "@/lib/ui";

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
      <p className="text-sm text-on-dark-muted tabular-nums">Page {pagination.page} · {shown} shown</p>
      <div className="flex flex-wrap gap-(--space-2)">
        {pagination.hasPrevious ? (
          <>
            <Link className={BTN_GHOST_SM} href={transferPageHref(pathname, search, 1)}>Newest requests</Link>
            <Link className={BTN_GHOST_SM} href={transferPageHref(pathname, search, pagination.page - 1)}>
              <Icon name="i-arrow-right" className="size-4 rotate-180" />
              Previous page
            </Link>
          </>
        ) : null}
        {pagination.hasNext ? (
          <Link className={BTN_GHOST_SM} href={transferPageHref(pathname, search, pagination.page + 1)}>
            Next page
            <Icon name="i-arrow-right" className="size-4" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
