import { Link } from 'react-router-dom';
import { IconArrowRight } from './Icons';
import { formatDecimal, formatNumber } from '../lib/format';

export default function StatStrip({ stats, worstTweet }) {
  const totalAnalyzed = Math.max(0, Number(stats?.totalAnalyzed) || 0);
  const avgScore = Number(stats?.avgScore) || 0;
  const maxScore = Number(stats?.maxScore) || 0;

  const worstScore = Number(worstTweet?.bullshit_score);
  const hasWorst =
    Boolean(worstTweet) &&
    worstTweet.bullshit_score !== null &&
    worstTweet.bullshit_score !== undefined &&
    Number.isFinite(worstScore);

  const cells = [
    {
      label: 'Tweets analysés',
      value: formatNumber(totalAnalyzed),
      note: 'dans la période',
    },
    {
      label: 'Score moyen',
      value: formatDecimal(avgScore),
      suffix: '/100',
      note: 'moyenne de la période',
    },
    {
      label: 'Score record',
      value: formatNumber(maxScore),
      suffix: '/100',
      note: 'meilleur score de bullshit',
    },
  ];

  return (
    <section aria-labelledby="stat-strip-title" className="mt-10 md:mt-12">
      <h2 id="stat-strip-title" className="sr-only">
        Chiffres clés de la période
      </h2>

      <dl className="grid grid-cols-2 border-y border-rule md:grid-cols-4">
        {cells.map((cell, index) => (
          <div
            key={cell.label}
            className={`border-rule px-4 py-5 md:px-6 md:py-6 ${
              index % 2 === 0 ? 'border-r' : ''
            } ${index < 2 ? 'border-b md:border-b-0' : ''} ${
              index > 0 ? 'md:border-l' : ''
            }`}
          >
            <dt className="eyebrow min-h-[30px] text-ink-muted">
              {cell.label}
            </dt>
            <dd className="mt-2 font-title text-4xl leading-none tracking-[-0.04em] tabular-nums text-ink md:text-5xl">
              {cell.value}
              {cell.suffix && (
                <span className="ml-1 font-mono text-[9px] tracking-normal text-ink-muted">
                  {cell.suffix}
                </span>
              )}
            </dd>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              {cell.note}
            </p>
          </div>
        ))}

        <div className="border-rule px-4 py-5 md:border-l md:px-6 md:py-6">
          <dt className="eyebrow min-h-[30px] text-ink-muted">
            Tweet le plus bullshit
          </dt>
          <dd className="mt-2">
            {hasWorst ? (
              <Link
                to={`/tweet/${encodeURIComponent(String(worstTweet.id))}`}
                className="group inline-flex items-baseline gap-2"
              >
                <span className="font-title text-4xl leading-none tracking-[-0.04em] tabular-nums text-ink transition-colors group-hover:text-vermillion md:text-5xl">
                  {Math.round(worstScore)}
                </span>
                <span className="font-mono text-[9px] text-ink-muted">/100</span>
                <IconArrowRight className="h-3.5 w-3.5 text-ink-muted transition-transform duration-150 group-hover:translate-x-1 group-hover:text-vermillion" />
              </Link>
            ) : (
              <p className="font-title text-4xl leading-none text-ink-muted md:text-5xl">
                —
              </p>
            )}
          </dd>
          <p className="mt-2 line-clamp-1 text-[11px] leading-relaxed break-words text-ink-muted">
            {hasWorst ? worstTweet.content : 'Aucun tweet sur cette page'}
          </p>
        </div>
      </dl>
    </section>
  );
}
