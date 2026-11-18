import { Link } from 'react-router-dom';
import { IconArrowUpRight } from './Icons';
import { formatDecimal, formatNumber } from '../lib/format';

export default function StatStrip({ stats, worstTweet }) {
  const totalAnalyzed = Math.max(0, Number(stats?.totalAnalyzed) || 0);
  const avgScore = Number(stats?.avgScore) || 0;
  const worstScore = Number(worstTweet?.bullshit_score);
  const hasWorst =
    Boolean(worstTweet) &&
    worstTweet.bullshit_score !== null &&
    worstTweet.bullshit_score !== undefined &&
    Number.isFinite(worstScore);

  const cells = [
    { label: 'Tweets passés au crible', value: formatNumber(totalAnalyzed), note: 'sur la période' },
    { label: 'Score moyen', value: formatDecimal(avgScore), suffix: '/100', note: 'la température générale' },
  ];

  return (
    <section aria-labelledby="stat-strip-title" className="mt-4">
      <h2 id="stat-strip-title" className="sr-only">Chiffres clés de la période</h2>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cells.map((cell) => (
          <div key={cell.label} className="surface-card p-4 md:p-5">
            <dt className="eyebrow text-ink-muted">{cell.label}</dt>
            <dd className="mt-4 font-title text-3xl leading-none tracking-[-0.055em] tabular-nums text-ink md:text-4xl">
              {cell.value}
              {cell.suffix && <span className="ml-1 font-mono text-[9px] tracking-normal text-ink-muted">{cell.suffix}</span>}
            </dd>
            <p className="mt-3 text-xs text-ink-muted">{cell.note}</p>
          </div>
        ))}

        <div className="surface-card p-4 md:p-5">
          <dt className="eyebrow text-ink-muted">Dossier le plus chaud</dt>
          <dd className="mt-4">
            {hasWorst ? (
              <Link to={`/tweet/${encodeURIComponent(String(worstTweet.id))}`} className="group flex items-center justify-between gap-2">
                <span className="font-title text-3xl leading-none tracking-[-0.055em] tabular-nums text-verdict-bullshit md:text-4xl">
                  {Math.round(worstScore)}<span className="ml-1 font-mono text-[9px] tracking-normal text-ink-muted">/100</span>
                </span>
                <IconArrowUpRight className="h-4 w-4 text-ink-muted transition-colors group-hover:text-vermillion" />
              </Link>
            ) : (
              <p className="font-title text-3xl leading-none text-ink-muted md:text-4xl">—</p>
            )}
          </dd>
          <p className="mt-3 truncate text-xs text-ink-muted">{hasWorst ? worstTweet.content : 'Aucun tweet sur cette page'}</p>
        </div>
      </dl>
    </section>
  );
}
