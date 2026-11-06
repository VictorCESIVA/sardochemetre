import { formatNumber, formatPercent } from '../lib/format';

const VERDICTS = [
  {
    key: 'VRAI',
    label: 'Vrai',
    text: 'text-verdict-true',
    bar: 'bg-verdict-true',
  },
  {
    key: 'DOUTEUX',
    label: 'Douteux',
    text: 'text-verdict-doubt',
    bar: 'bg-verdict-doubt',
  },
  {
    key: 'BULLSHIT',
    label: 'Bullshit',
    text: 'text-verdict-bullshit',
    bar: 'bg-verdict-bullshit',
  },
  {
    key: 'CHAUD BOUILLANT',
    label: 'Chaud bouillant',
    text: 'text-verdict-hot',
    bar: 'bg-verdict-hot',
  },
];

export default function VerdictBreakdown({
  distribution = {},
  totalAnalyzed = 0,
}) {
  const safeTotal = Math.max(0, Number(totalAnalyzed) || 0);

  return (
    <section
      aria-labelledby="verdict-breakdown-title"
      className="lg:border-l lg:border-rule lg:pl-8"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
        <h2 id="verdict-breakdown-title" className="eyebrow text-ink-muted">
          Répartition des verdicts
        </h2>
        <span className="font-mono text-[9px] tracking-[0.1em] text-ink-muted uppercase">
          {formatNumber(safeTotal)} analysé{safeTotal > 1 ? 's' : ''}
        </span>
      </div>

      <ul>
        {VERDICTS.map((verdict) => {
          const entry = distribution?.[verdict.key];
          const count = Math.max(0, Math.floor(Number(entry?.count) || 0));
          const percentage = Math.min(
            100,
            Math.max(0, Number(entry?.percentage) || 0),
          );

          return (
            <li key={verdict.key} className="border-b border-rule py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`font-mono text-[10px] tracking-[0.12em] uppercase ${verdict.text}`}
                >
                  {verdict.label}
                </span>
                <span className="flex items-baseline gap-3">
                  <span className="font-title text-xl leading-none tabular-nums text-ink">
                    {formatNumber(count)}
                  </span>
                  <span className="w-12 text-right font-mono text-[9px] text-ink-muted">
                    {formatPercent(percentage)}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-px w-full bg-rule">
                <div
                  className={`h-px ${verdict.bar}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {safeTotal === 0 && (
        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Aucune analyse sur cette période. Le mètre reste au repos.
        </p>
      )}
    </section>
  );
}
