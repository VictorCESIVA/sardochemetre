import { useState } from 'react';

const FALLBACK_AVATAR = '/sardoche-avatar.jpg';

function getSources(avatarUrl, useLocalFallback) {
  const sources = [];
  if (avatarUrl && String(avatarUrl).trim()) {
    sources.push(String(avatarUrl).trim());
  }
  if (
    useLocalFallback &&
    !sources.includes(FALLBACK_AVATAR)
  ) {
    sources.push(FALLBACK_AVATAR);
  }
  return sources;
}

function isSardoche(author) {
  return /\bsardoche\b/i.test(
    `${author?.username || ''} ${author?.name || ''}`,
  );
}

function getInitials(author) {
  const source = author?.name || author?.username || 'S';
  const letters = Array.from(source).filter((character) =>
    /[\p{L}\p{N}]/u.test(character),
  );
  return (letters.slice(0, 2).join('') || 'S').toUpperCase();
}

export default function TweetAvatar({
  author,
  size = 48,
  className = '',
}) {
  const sources = getSources(author?.avatar_url, isSardoche(author));
  const [failedSources, setFailedSources] = useState([]);

  const initials = getInitials(author);
  const fontClass =
    size <= 24 ? 'text-[8px]' : size <= 36 ? 'text-[10px]' : 'text-xs';
  const currentSource = sources.find(
    (source) => !failedSources.includes(source),
  );

  if (!currentSource) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-embed-rule bg-paper-alt font-mono font-medium tracking-wide text-ink-muted ${fontClass} ${className}`}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={currentSource}
      alt={`Photo de profil de ${author?.name || author?.username || 'Sardoche'}`}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() =>
        setFailedSources((current) =>
          current.includes(currentSource)
            ? current
            : [...current, currentSource],
        )
      }
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full border border-embed-rule bg-paper-alt object-cover ${fontClass} ${className}`}
    />
  );
}
