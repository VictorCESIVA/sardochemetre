import { Link } from 'react-router-dom';
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
    <article aria-labelledby="lead-story-title" className="surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-4 md:px-7">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-verdict-bullshit" />
          <h2 id="lead-story-title" className="eyebrow text-ink">Le dossier chaud</h2>
        </div>
        <span className="eyebrow hidden text-ink-muted sm:block">Le score le plus élevé de la page</span>
      </div>

      <div className="p-5 md:p-7">
        <div className="flex items-start justify-between gap-5">
          <div>
            <VerdictBadge verdict={tweet.verdict || 'NON ANALYSÉ'} />
            <p className="eyebrow mt-3 text-ink-muted">Verdict de la rédaction IA</p>
          </div>
          {hasScore && (
            <p className="text-right font-title text-5xl leading-none tracking-[-0.07em] tabular-nums text-verdict-bullshit md:text-6xl">
              {score}<span className="ml-1 font-mono text-[10px] tracking-normal text-ink-muted">/100</span>
            </p>
          )}
        </div>

        <div className="mt-7">
          <TweetEmbed tweet={tweet} profile={profile} variant="full" className="!border-0 !bg-transparent !p-0" />
        </div>

        {tweet.humor_comment && (
          <blockquote className="mt-6 border-l-2 border-vermillion pl-4 text-base leading-relaxed text-ink-muted">
            « {tweet.humor_comment} »
          </blockquote>
        )}

        <Link to={href} className="btn-primary mt-7">
          Lire le dossier complet
          <IconArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
