import { resolveAuthor } from '../lib/profile';
import TweetAvatar from './TweetAvatar';
import TweetMedia from './TweetMedia';
import TweetText from './TweetText';
import VerifiedBadge from './VerifiedBadge';

export default function QuotedTweet({ tweet, profile = null, compact = false }) {
  if (!tweet) return null;

  const author = resolveAuthor(tweet.author, profile);
  const textClass = compact
    ? 'mt-1.5 line-clamp-2 text-[12px] leading-[1.4] text-ink'
    : 'mt-2 line-clamp-4 text-[13px] leading-[1.5] text-ink';

  return (
    <div
      role="group"
      aria-label="Tweet cité"
      className={`rounded-[12px] border border-embed-rule bg-paper ${
        compact ? 'mt-2.5 w-full max-w-[34rem] p-2.5' : 'mt-3 p-3 md:p-3.5'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <TweetAvatar author={author} size={compact ? 20 : 24} />
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate font-sans text-[12px] font-semibold text-ink">
            {author.name}
          </span>
          {author.verified && <VerifiedBadge size={compact ? 12 : 13} />}
          <span className="truncate font-mono text-[9px] text-ink-muted">
            @{author.username}
          </span>
        </div>
      </div>

      {tweet.content && <TweetText content={tweet.content} className={textClass} />}

      {!compact && (
        <TweetMedia
          media={tweet.media}
          variant="quoted"
          username={author.username}
        />
      )}
    </div>
  );
}
