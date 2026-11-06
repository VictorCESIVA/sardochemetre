import { IconArrowLeft, IconArrowRight } from './Icons';

export default function Pagination({
  page = 1,
  totalPages = 1,
  hasPrev = page > 1,
  hasNext = page < totalPages,
  onPageChange,
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination des archives"
      className="mt-6 flex items-center justify-between gap-4 border-t border-ink pt-4"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={!hasPrev}
        className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors enabled:hover:text-vermillion disabled:cursor-not-allowed disabled:text-ink-muted disabled:opacity-40"
      >
        <IconArrowLeft className="h-3.5 w-3.5" />
        Précédent
      </button>

      <p
        aria-live="polite"
        className="font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase"
      >
        Page {page} / {totalPages}
      </p>

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNext}
        className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors enabled:hover:text-vermillion disabled:cursor-not-allowed disabled:text-ink-muted disabled:opacity-40"
      >
        Suivant
        <IconArrowRight className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
}
