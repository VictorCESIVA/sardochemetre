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
        className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 text-ink-muted"
      >
        <IconSearch className="h-3.5 w-3.5" />
      </span>
      <input
        id="archive-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Rechercher dans les archives…"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className="w-full border-b border-ink bg-transparent py-2 pr-28 pl-6 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-offset-4"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Effacer la recherche"
          title="Effacer la recherche"
          className="absolute top-1/2 right-[4.6rem] flex h-6 w-6 -translate-y-1/2 items-center justify-center text-ink-muted transition-colors hover:text-vermillion"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="submit"
        className="absolute top-1/2 right-0 -translate-y-1/2 font-mono text-[10px] tracking-[0.14em] text-ink uppercase transition-colors hover:text-vermillion"
      >
        Chercher
      </button>
    </form>
  );
}
