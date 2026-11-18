import { formatNumber, formatPercent } from '../lib/format';

const VERDICTS = [
  { key: 'VRAI', label: 'Vrai', text: 'text-verdict-true', bar: 'bg-verdict-true' },
  { key: 'DOUTEUX', label: 'Douteux', text: 'text-verdict-doubt', bar: 'bg-verdict-doubt' },
  { key: 'BULLSHIT', label: 'Bullshit', text: 'text-verdict-bullshit', bar: 'bg-verdict-bullshit' },
  { key: 'CHAUD BOUILLANT', label: 'Chaud bouillant', text: 'text-verdict-hot', bar: 'bg-verdict-hot' },
];

export default function VerdictBreakdown({ distribution = {}, totalAnalyzed = 0 }) {
  const safeTotal = Math.max(0, Number(totalAnalyzed) || 0);

  return (
    <section aria-labelledby="verdict-breakdown-title" className="surface-card p-5 md:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 id="verdict-breakdown-title" className="eyebrow text-ink">Les verdicts</h2>
        <span className="rounded-full border border-rule px-2.5 py-1 font-mono text-[9px] text-ink-muted">
          {formatNumber(safeTotal)} analysé{safeTotal > 1 ? 's' : ''}
        </span>
      </div>

      <ul className="mt-6 space-y-5">
        {VERDICTS.map((verdict) => {
          const entry = distribution?.[verdict.key];
          const count = Math.max(0, Math.floor(Number(entry?.count) || 0));
          const percentage = Math.min(100, Math.max(0, Number(entry?.percentage) || 0));

          return (
            <li key={verdict.key}>
              <div className="flex items-center justify-between gap-3">
                <span className={`flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] uppercase ${verdict.text}`}>
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${verdict.bar}`} />
                  {verdict.label}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-sans text-sm font-semibold tabular-nums text-ink">{formatNumber(count)}</span>
                  <span className="w-11 text-right font-mono text-[9px] text-ink-muted">{formatPercent(percentage)}</span>
                </span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-rule">
                <div className={`h-full rounded-full ${verdict.bar}`} style={{ width: `${percentage}%` }} />
              </div>
            </li>
          );
        })}
      </ul>

      {safeTotal === 0 && (
        <p className="mt-5 text-xs leading-relaxed text-ink-muted">Aucune analyse sur cette période. Le mètre reste au repos.</p>
      )}
    </section>
  );
}
