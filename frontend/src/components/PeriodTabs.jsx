const PERIODS = [
  { id: 'day', label: 'Aujourd’hui' },
  { id: 'week', label: 'Cette semaine' },
  { id: 'month', label: 'Ce mois' },
  { id: 'all', label: 'Tout l’historique' },
];

export default function PeriodTabs({ value = 'all', onChange }) {
  return (
    <nav aria-label="Filtrer par période">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 sm:gap-x-5 md:gap-x-6">
        {PERIODS.map((period) => {
          const active = value === period.id;

          return (
            <li key={period.id}>
              <button
                type="button"
                onClick={() => onChange(period.id)}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px border-b-2 pb-2 font-mono text-[10px] tracking-[0.12em] whitespace-nowrap uppercase transition-colors ${
                  active
                    ? 'border-vermillion text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink'
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
