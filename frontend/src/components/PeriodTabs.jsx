const PERIODS = [
  { id: 'day', label: '24 h' },
  { id: 'week', label: '7 jours' },
  { id: 'month', label: '30 jours' },
  { id: 'all', label: 'Tout' },
];

export default function PeriodTabs({ value = 'all', onChange }) {
  return (
    <nav aria-label="Filtrer par période">
      <ul className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-rule bg-paper-alt p-1">
        {PERIODS.map((period) => {
          const active = value === period.id;

          return (
            <li key={period.id}>
              <button
                type="button"
                onClick={() => onChange(period.id)}
                aria-current={active ? 'page' : undefined}
                className={`rounded-full px-4 py-2 font-mono text-[10px] font-medium tracking-[0.08em] whitespace-nowrap uppercase transition-colors sm:px-5 ${
                  active
                    ? 'bg-vermillion text-paper'
                    : 'text-ink-muted hover:bg-rule/60 hover:text-ink'
                }`}
              >
                {period.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
