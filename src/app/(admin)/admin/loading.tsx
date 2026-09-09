export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading admin workspace" className="space-y-(--space-6)">
      <span className="sr-only">Loading admin workspace…</span>
      <div aria-hidden="true" className="h-12 w-72 rounded-(--radius-sm) bg-white/10 motion-safe:animate-pulse" />
      <div aria-hidden="true" className="grid gap-(--space-4) sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => <div key={key} className="h-40 rounded-(--radius-lg) border border-hairline bg-black-2" />)}
      </div>
    </div>
  );
}
