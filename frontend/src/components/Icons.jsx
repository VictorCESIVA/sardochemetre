const SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
};

export function IconSearch({ className = 'h-4 w-4' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconArrowRight({ className = 'h-4 w-4' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function IconArrowLeft({ className = 'h-4 w-4' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <path d="M20 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function IconArrowUpRight({ className = 'h-4 w-4' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export function IconHeart({ className = 'h-4 w-4' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <path d="M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z" />
    </svg>
  );
}

export function IconRepost({ className = 'h-4 w-4' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </svg>
  );
}

export function IconClock({ className = 'h-4 w-4' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconClose({ className = 'h-4 w-4' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

export function IconReply({ className = 'h-4 w-4' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H8l-5 3v-6.5A8.5 8.5 0 0 1 11.5 3h1A8.5 8.5 0 0 1 21 11.5Z" />
    </svg>
  );
}

export function IconViews({ className = 'h-4 w-4' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <path d="M4 20v-6" />
      <path d="M9 20V9" />
      <path d="M14 20v-4" />
      <path d="M19 20V5" />
    </svg>
  );
}

export function IconPlay({ className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

export function IconImageOff({ className = 'h-5 w-5' }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 16 5-5 4 4 3-3 5 5" />
      <path d="m4 4 16 16" />
    </svg>
  );
}

export function IconXLogo({ className = 'h-4 w-4' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}
