import { createElement } from 'react';
import { resolveAuthor } from '../lib/profile';
import {
  formatCompactNumber,
  formatNumber,
  formatTweetDate,
  formatTweetTimestamp,
} from '../lib/format';
import QuotedTweet from './QuotedTweet';
import TweetAvatar from './TweetAvatar';
import TweetMedia from './TweetMedia';
import TweetText from './TweetText';
import VerifiedBadge from './VerifiedBadge';
import {
  IconHeart,
  IconReply,
  IconRepost,
  IconViews,
  IconXLogo,
} from './Icons';

function Counter({ icon, label, value }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-ink-muted"
      title={label}
      aria-label={`${label} : ${formatNumber(value)}`}
    >
      {createElement(icon, { className: 'h-3.5 w-3.5' })}
      <span className="font-mono text-[10px] tabular-nums">
        {formatCompactNumber(value)}
      </span>
    </span>
  );
}

export default function TweetEmbed({
  tweet,
  profile = null,
  variant = 'full',
  className = '',
  showMedia = true,
  showQuoted = true,
}) {
  if (!tweet) return null;

  const author = resolveAuthor(tweet.author, profile);
  const username = author.username || 'Sardoche';
  const xUrl = tweet.id
    ? `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(String(tweet.id))}`
    : `https://x.com/${encodeURIComponent(username)}`;
  const dateTime = tweet.posted_at || undefined;

  if (variant === 'compact') {
    return (
      <div className={`min-w-0 ${className}`}>
        <div className="flex items-start gap-3">
          <TweetAvatar author={author} size={38} />

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="truncate font-sans text-[13px] font-semibold leading-tight text-ink">
                {author.name}
              </span>
              {author.verified && <VerifiedBadge size={13} />}
              <span className="truncate font-mono text-[10px] text-ink-muted">
                @{username}
              </span>
              <span aria-hidden="true" className="text-rule">
                ·
              </span>
              <time
                dateTime={dateTime}
                className="font-mono text-[9px] tracking-[0.06em] text-ink-muted uppercase"
              >
                {formatTweetDate(tweet.posted_at)}
              </time>
            </div>

            <TweetText
              content={tweet.content}
              className="mt-1 line-clamp-3 text-[14px] leading-[1.45] text-ink md:text-[15px]"
            />

            {showMedia && (
              <TweetMedia
                media={tweet.media}
                variant="compact"
                username={username}
              />
            )}

            {showQuoted && tweet.quoted_tweet && (
              <QuotedTweet
                tweet={tweet.quoted_tweet}
                profile={profile}
                compact
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <article
      aria-label={`Tweet de ${author.name}`}
      className={`rounded-[14px] border border-embed-rule bg-embed p-[18px] md:p-[22px] ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <TweetAvatar author={author} size={48} />

          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="font-sans text-[15px] font-semibold leading-tight text-ink">
                {author.name}
              </span>
              {author.verified && <VerifiedBadge size={16} />}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10px] text-ink-muted">
              <span>@{username}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={dateTime}>{formatTweetTimestamp(tweet.posted_at)}</time>
            </div>
          </div>
        </div>

        <span aria-hidden="true" className="shrink-0 pt-0.5 text-ink-muted/70">
          <IconXLogo className="h-4 w-4" />
        </span>
      </div>

      <TweetText
        content={tweet.content}
        className="mt-3.5 text-[18px] leading-[1.5] text-ink md:text-[19px]"
      />

      {showMedia && (
        <TweetMedia media={tweet.media} variant="full" username={username} />
      )}

      {showQuoted && tweet.quoted_tweet && (
        <QuotedTweet tweet={tweet.quoted_tweet} profile={profile} />
      )}

      <footer className="mt-4 flex flex-col gap-3 border-t border-embed-rule pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Counter icon={IconReply} label="Réponses" value={tweet.replies} />
          <Counter icon={IconRepost} label="Reposts" value={tweet.retweets} />
          <Counter icon={IconHeart} label="J’aime" value={tweet.likes} />
          <Counter icon={IconViews} label="Vues" value={tweet.views} />
        </div>

        <a
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Voir le tweet de @${username} sur X (nouvel onglet)`}
          className="inline-flex w-fit items-center gap-1.5 font-mono text-[9px] tracking-[0.12em] text-ink-muted uppercase transition-colors hover:text-vermillion"
        >
          Voir sur X
          <IconXLogo className="h-3 w-3" />
        </a>
      </footer>
    </article>
  );
}
