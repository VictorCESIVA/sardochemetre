import { IconClose, IconSearch } from './Icons';

export default function SearchField({
  value,
  onChange,
  onClear,
  onSubmit,
  busy = false,
}) {
  return (
    <form
      role="search"
      aria-busy={busy}
      onSubmit={onSubmit}
      className="relative w-full"
    >
      <label htmlFor="archive-search" className="sr-only">
        Rechercher dans les archives
      </label>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted"
      >
        <IconSearch className="h-4 w-4" />
      </span>
      <input
        id="archive-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Un mot, une dinguerie…"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className="h-12 w-full rounded-full border border-rule bg-paper-alt pr-20 pl-11 text-sm text-ink placeholder:text-ink-muted focus:border-ink-muted focus-visible:outline-offset-2"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Effacer la recherche"
          title="Effacer la recherche"
          className="absolute top-1/2 right-14 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-ink-muted transition-colors hover:text-vermillion"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="submit"
        aria-label="Lancer la recherche"
        className="absolute top-1/2 right-3 flex h-8 w-10 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-rule hover:text-vermillion"
      >
        <span className="font-mono text-sm" aria-hidden="true">↵</span>
      </button>
    </form>
  );
}
