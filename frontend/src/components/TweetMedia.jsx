import { useState } from 'react';
import { normalizeMedia } from '../lib/tweetUtils';
import { IconImageOff, IconPlay } from './Icons';

function MediaItem({ media, index, username, className = '' }) {
  const [failed, setFailed] = useState(false);
  const isVideo = media.type === 'video' || media.type === 'animated_gif';
  const typeLabel = media.type === 'animated_gif' ? 'GIF' : 'Vidéo';
  const alt =
    media.alt ||
    `${isVideo ? typeLabel : 'Photo'} ${index + 1} du tweet de @${username}`;

  return (
    <div
      className={`relative overflow-hidden rounded-[10px] border border-embed-rule bg-paper-alt ${className}`}
    >
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-muted">
          <IconImageOff className="h-5 w-5" />
          <span className="eyebrow text-[8px]">Média indisponible</span>
        </div>
      ) : (
        <img
          src={media.url}
          alt={alt}
          width={media.width || undefined}
          height={media.height || undefined}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}

      {isVideo && !failed && (
        <>
          <span className="absolute top-2 left-2 rounded-[2px] bg-ink/75 px-1.5 py-1 font-mono text-[8px] tracking-[0.12em] text-paper uppercase">
            {typeLabel}
          </span>
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-ink/70 text-paper"
          >
            <IconPlay className="ml-0.5 h-5 w-5" />
          </span>
        </>
      )}
    </div>
  );
}

export default function TweetMedia({
  media,
  variant = 'full',
  username = 'Sardoche',
}) {
  const items = normalizeMedia(media).slice(0, 4);
  if (items.length === 0) return null;

  if (variant === 'compact') {
    return (
      <div className="relative mt-2.5 w-full max-w-[18rem]">
        <MediaItem
          media={items[0]}
          index={0}
          username={username}
          className="aspect-[16/9] w-full"
        />
        {items.length > 1 && (
          <span className="absolute top-2 right-2 rounded-[2px] bg-ink/75 px-1.5 py-1 font-mono text-[8px] tracking-[0.1em] text-paper">
            +{items.length - 1}
          </span>
        )}
      </div>
    );
  }

  if (variant === 'quoted') {
    return (
      <div className="mt-2.5 w-full max-w-[18rem]">
        <MediaItem
          media={items[0]}
          index={0}
          username={username}
          className="aspect-[16/9] w-full"
        />
      </div>
    );
  }

  if (items.length === 1) {
    return (
      <div className="mt-3" role="group" aria-label="Média du tweet">
        <MediaItem
          media={items[0]}
          index={0}
          username={username}
          className="aspect-[16/10] w-full"
        />
      </div>
    );
  }

  return (
    <div
      className="mt-3 grid grid-cols-2 gap-1.5"
      role="group"
      aria-label="Médias du tweet"
    >
      {items.map((item, index) => (
        <MediaItem
          key={`${item.url}-${index}`}
          media={item}
          index={index}
          username={username}
          className={
            items.length === 3 && index === 0
              ? 'col-span-2 aspect-[16/9]'
              : 'aspect-square'
          }
        />
      ))}
    </div>
  );
}
