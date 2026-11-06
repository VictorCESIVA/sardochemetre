import { Link } from 'react-router-dom';
import SectionLabel from './SectionLabel';
import TweetEmbed from './TweetEmbed';
import VerdictBadge from './VerdictBadge';
import { IconArrowRight } from './Icons';

export default function LeadStory({ tweet, profile = null }) {
  if (!tweet) return null;

  const numericScore = Number(tweet.bullshit_score);
  const hasScore =
    tweet.bullshit_score !== null &&
    tweet.bullshit_score !== undefined &&
    Number.isFinite(numericScore);
  const score = hasScore ? Math.round(numericScore) : null;
  const href = `/tweet/${encodeURIComponent(String(tweet.id))}`;

  return (
    <article aria-labelledby="lead-story-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink pb-2">
        <SectionLabel as="h2" id="lead-story-title">
          À la une
        </SectionLabel>
        <span className="eyebrow text-ink-muted">
          Le plus bullshit de la page
        </span>
      </div>

      <div className="mt-5">
        <TweetEmbed tweet={tweet} profile={profile} variant="full" />
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-6 border-t border-rule pt-4">
        <div className="flex flex-wrap items-end gap-4">
          <VerdictBadge verdict={tweet.verdict || 'NON ANALYSÉ'} />
          {hasScore && (
            <p className="font-title text-6xl leading-[0.8] tracking-[-0.055em] tabular-nums text-ink md:text-7xl">
              {score}
              <span className="ml-2 font-mono text-[10px] tracking-normal text-ink-muted">
                /100
              </span>
            </p>
          )}
        </div>

        {tweet.humor_comment && (
          <p className="max-w-md font-title text-lg leading-snug break-words italic text-ink-muted md:text-xl">
            « {tweet.humor_comment} »
          </p>
        )}
      </div>

      <Link to={href} className="link-editorial group mt-5 text-ink">
        Lire l’analyse
        <IconArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-1" />
      </Link>
    </article>
  );
}
