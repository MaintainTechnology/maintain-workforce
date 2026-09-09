export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="Loading workspace" className="flex flex-col gap-(--space-6)">
      <span className="sr-only">Loading workspace…</span>
      <div aria-hidden="true" className="space-y-(--space-3)">
        <div className="h-10 w-56 max-w-full rounded-(--radius-sm) bg-white/10 motion-safe:animate-pulse" />
        <div className="h-5 w-96 max-w-full rounded-(--radius-sm) bg-white/5" />
      </div>
      <div aria-hidden="true" className="grid gap-(--space-5) xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {[0, 1].map((index) => (
          <div key={index} className="h-72 rounded-(--radius-lg) border border-hairline bg-black-2 p-(--space-6)">
            <div className="h-6 w-40 max-w-full rounded-(--radius-sm) bg-white/10 motion-safe:animate-pulse" />
            <div className="mt-(--space-6) h-24 rounded-(--radius-sm) bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
