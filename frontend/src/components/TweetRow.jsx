import { Link } from 'react-router-dom';
import TweetEmbed from './TweetEmbed';
import VerdictBadge from './VerdictBadge';
import { IconArrowUpRight } from './Icons';
import { formatIndex } from '../lib/format';

export default function TweetRow({ tweet, index = 1, profile = null }) {
  const numericScore = Number(tweet?.bullshit_score);
  const hasScore =
    tweet?.bullshit_score !== null &&
    tweet?.bullshit_score !== undefined &&
    Number.isFinite(numericScore);
  const score = hasScore ? Math.round(numericScore) : null;
  const verdict = tweet?.verdict || 'NON ANALYSÉ';

  return (
    <Link
      to={`/tweet/${encodeURIComponent(String(tweet.id))}`}
      className="surface-card group flex h-full flex-col p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-ink-muted md:p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-[10px] text-ink-muted">
            Dossier {formatIndex(index)}
          </span>
          <VerdictBadge verdict={verdict} size="sm" />
        </div>

        {hasScore ? (
          <p className="shrink-0 font-title text-2xl leading-none tracking-[-0.05em] tabular-nums text-ink">
            {score}<span className="ml-1 font-mono text-[9px] tracking-normal text-ink-muted">/100</span>
          </p>
        ) : (
          <p className="eyebrow shrink-0 text-ink-muted">En attente</p>
        )}
      </div>

      <div className="mt-6 flex-1">
        <TweetEmbed tweet={tweet} profile={profile} variant="compact" />
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-rule pt-4">
        <span className="eyebrow text-ink-muted transition-colors group-hover:text-ink">Ouvrir le dossier</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-rule text-ink-muted transition-[background-color,color,transform] group-hover:rotate-12 group-hover:bg-vermillion group-hover:text-paper">
          <IconArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
