import { IconArrowLeft, IconArrowRight } from './Icons';

export default function Pagination({ page = 1, totalPages = 1, hasPrev = page > 1, hasNext = page < totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination des archives" className="mt-8 flex items-center justify-between gap-4 border-t border-rule pt-6">
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={!hasPrev} className="btn-outline !min-h-10 !px-4 enabled:hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-35">
        <IconArrowLeft className="h-3.5 w-3.5" /><span className="hidden sm:inline">Précédent</span>
      </button>
      <p aria-live="polite" className="font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase">Page {page} / {totalPages}</p>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={!hasNext} className="btn-outline !min-h-10 !px-4 enabled:hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-35">
        <span className="hidden sm:inline">Suivant</span><IconArrowRight className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
}
