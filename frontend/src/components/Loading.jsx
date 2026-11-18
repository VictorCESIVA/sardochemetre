export default function Loading({ message = 'Chargement des archives…', rows = 6 }) {
  return (
    <div role="status" aria-live="polite" className="py-6">
      <h1 className="sr-only">{message}</h1>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-vermillion" />
        <p className="eyebrow text-ink-muted">{message}</p>
      </div>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="surface-card p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="h-5 w-24 animate-pulse rounded-full bg-rule" />
              <div className="h-8 w-14 animate-pulse rounded-lg bg-rule" />
            </div>
            <div className="mt-7 flex gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-rule" />
              <div className="flex-1 space-y-3 pt-1">
                <div className="h-3 w-1/2 animate-pulse rounded bg-rule" />
                <div className="h-3 w-full animate-pulse rounded bg-rule" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-rule" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
