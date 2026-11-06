export default function Loading({
  message = 'Chargement des archives…',
  rows = 6,
}) {
  return (
    <div role="status" aria-live="polite" className="py-6">
      <h1 className="sr-only">{message}</h1>
      <p className="eyebrow text-ink-muted">{message}</p>

      <div className="mt-6 border-t border-rule">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[2rem_minmax(0,1fr)_4rem] items-start gap-4 border-b border-rule py-5 md:grid-cols-[3rem_minmax(0,1fr)_5rem] md:gap-6 md:py-6"
          >
            <div className="h-2.5 w-6 animate-pulse bg-paper-alt" />
            <div className="space-y-2.5">
              <div className="h-3 w-full max-w-2xl animate-pulse bg-paper-alt" />
              <div className="h-3 w-2/3 max-w-xl animate-pulse bg-paper-alt" />
            </div>
            <div className="h-8 w-12 animate-pulse justify-self-end bg-paper-alt" />
          </div>
        ))}
      </div>
    </div>
  );
}
