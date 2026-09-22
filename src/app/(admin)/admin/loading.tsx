import { PANEL } from "@/lib/ui";

// Skeleton matching the admin page scaffold: title block, then the two-panel
// ledger and a wide register. Shapes only, sized like the real content so the
// swap to data does not shift the page.
const BONE = "rounded-(--radius-sm) bg-white/[0.06]";

export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading admin workspace" className="flex flex-col gap-(--space-6) motion-safe:animate-pulse">
      <span className="sr-only">Loading admin workspace…</span>
      <div aria-hidden="true" className="flex flex-col gap-(--space-3)">
        <div className={`${BONE} h-9 w-56`} />
        <div className={`${BONE} h-4 w-[min(36rem,100%)]`} />
        <div className={`${BONE} h-4 w-[min(22rem,100%)]`} />
      </div>
      <div aria-hidden="true" className="grid gap-(--space-5) xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={`${PANEL} p-(--space-5)`}>
          <div className={`${BONE} h-5 w-40`} />
          <div className="mt-(--space-5) grid gap-(--space-6) sm:grid-cols-2">
            {[0, 1].map((column) => (
              <div key={column} className="flex flex-col divide-y divide-hairline">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex items-center justify-between py-(--space-3)">
                    <div className={`${BONE} h-4 w-32`} />
                    <div className={`${BONE} h-7 w-14`} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className={`${PANEL} p-(--space-5)`}>
          <div className={`${BONE} h-5 w-40`} />
          <div className="mt-(--space-5) flex flex-col divide-y divide-hairline">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between py-(--space-3)">
                <div className={`${BONE} h-4 w-36`} />
                <div className={`${BONE} h-7 w-12`} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden="true" className={`${PANEL} p-(--space-5)`}>
        <div className={`${BONE} h-5 w-36`} />
        <div className="mt-(--space-5) grid gap-(--space-4) sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div key={key} className="flex flex-col gap-(--space-2)">
              <div className={`${BONE} h-3 w-24`} />
              <div className={`${BONE} h-9 w-16`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
