import { Link } from 'react-router-dom';
import TweetEmbed from './TweetEmbed';
import VerdictBadge from './VerdictBadge';
import { IconArrowRight } from './Icons';
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
      className="group block border-b border-rule px-2 py-5 transition-colors hover:bg-paper-alt md:px-3 md:py-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="eyebrow text-ink-muted">
              {formatIndex(index)}
            </span>
            <VerdictBadge verdict={verdict} size="sm" />
          </div>

          <div className="mt-3">
            <TweetEmbed
              tweet={tweet}
              profile={profile}
              variant="compact"
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
          {hasScore ? (
            <p className="font-title text-3xl leading-none tracking-[-0.04em] tabular-nums text-ink md:text-4xl">
              {score}
              <span className="ml-1 font-mono text-[9px] tracking-normal text-ink-muted">
                /100
              </span>
            </p>
          ) : (
            <p className="eyebrow text-ink-muted">En attente</p>
          )}
          <IconArrowRight className="h-4 w-4 text-ink-muted transition-transform duration-150 group-hover:translate-x-1 group-hover:text-vermillion" />
        </div>
      </div>
    </Link>
  );
}
