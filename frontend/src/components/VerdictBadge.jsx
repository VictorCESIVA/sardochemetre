const TONES = {
  VRAI: {
    text: 'text-verdict-true',
    border: 'border-verdict-true/40',
    dot: 'bg-verdict-true',
  },
  DOUTEUX: {
    text: 'text-verdict-doubt',
    border: 'border-verdict-doubt/40',
    dot: 'bg-verdict-doubt',
  },
  BULLSHIT: {
    text: 'text-verdict-bullshit',
    border: 'border-verdict-bullshit/40',
    dot: 'bg-verdict-bullshit',
  },
  'CHAUD BOUILLANT': {
    text: 'text-verdict-hot',
    border: 'border-verdict-hot/40',
    dot: 'bg-verdict-hot',
  },
  FAUX: {
    text: 'text-verdict-bullshit',
    border: 'border-verdict-bullshit/40',
    dot: 'bg-verdict-bullshit',
  },
  MENSONGE: {
    text: 'text-verdict-bullshit',
    border: 'border-verdict-bullshit/40',
    dot: 'bg-verdict-bullshit',
  },
  ARNAQUE: {
    text: 'text-verdict-bullshit',
    border: 'border-verdict-bullshit/40',
    dot: 'bg-verdict-bullshit',
  },
  MANIPULATEUR: {
    text: 'text-verdict-bullshit',
    border: 'border-verdict-bullshit/40',
    dot: 'bg-verdict-bullshit',
  },
  MANIPULATOIRE: {
    text: 'text-verdict-bullshit',
    border: 'border-verdict-bullshit/40',
    dot: 'bg-verdict-bullshit',
  },
  EXAGERE: {
    text: 'text-verdict-bullshit',
    border: 'border-verdict-bullshit/40',
    dot: 'bg-verdict-bullshit',
  },
  SUBJECTIF: {
    text: 'text-verdict-doubt',
    border: 'border-verdict-doubt/40',
    dot: 'bg-verdict-doubt',
  },
  DISCUTABLE: {
    text: 'text-verdict-doubt',
    border: 'border-verdict-doubt/40',
    dot: 'bg-verdict-doubt',
  },
  POSSIBLE: {
    text: 'text-verdict-doubt',
    border: 'border-verdict-doubt/40',
    dot: 'bg-verdict-doubt',
  },
  PLAUSIBLE: {
    text: 'text-verdict-doubt',
    border: 'border-verdict-doubt/40',
    dot: 'bg-verdict-doubt',
  },
  INVERIFIABLE: {
    text: 'text-ink-muted',
    border: 'border-rule',
    dot: 'bg-ink-muted',
  },
  'NON CLASSE': {
    text: 'text-ink-muted',
    border: 'border-rule',
    dot: 'bg-ink-muted',
  },
  'NON ANALYSE': {
    text: 'text-ink-muted',
    border: 'border-rule',
    dot: 'bg-ink-muted',
  },
};

const FALLBACK_TONE = {
  text: 'text-ink-muted',
  border: 'border-rule',
  dot: 'bg-ink-muted',
};

const SIZES = {
  sm: 'px-2 py-1 text-[8px] gap-1.5',
  md: 'px-2.5 py-1.5 text-[9px] gap-2',
  lg: 'px-3 py-2 text-[10px] gap-2',
};

function toneKey(verdict) {
  return String(verdict ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, ' ');
}

function resolveTone(verdict) {
  const key = toneKey(verdict);
  if (TONES[key]) return TONES[key];

  if (
    key.includes('FAUX') ||
    key.includes('MANIPUL') ||
    key.includes('MENSONG') ||
    key.includes('ARNAQUE') ||
    key.includes('TROMP') ||
    key.includes('ERRONE')
  ) {
    return TONES.FAUX;
  }

  if (
    key.includes('INVERIFIABLE') ||
    key.includes('NON CLASSE') ||
    key.includes('NON ANALYSE')
  ) {
    return TONES.INVERIFIABLE;
  }

  if (
    key.includes('DOUTEUX') ||
    key.includes('SUBJECTIF') ||
    key.includes('DISCUTABLE') ||
    key.includes('POSSIBLE') ||
    key.includes('PARTIEL') ||
    key.includes('PLAUSIBLE')
  ) {
    return TONES.SUBJECTIF;
  }

  if (key.includes('VRAI') || key.includes('CONFIRM')) {
    return TONES.VRAI;
  }

  return FALLBACK_TONE;
}

export default function VerdictBadge({ verdict, size = 'md', className = '' }) {
  const label = String(verdict ?? 'NON ANALYSÉ').trim().toUpperCase();
  const tone = resolveTone(verdict);
  const sizing = SIZES[size] || SIZES.md;

  return (
    <span
      className={`inline-flex items-center rounded-[1px] border bg-transparent font-mono leading-none tracking-[0.12em] uppercase ${sizing} ${tone.text} ${tone.border} ${className}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 ${tone.dot}`} />
      <span>{label}</span>
    </span>
  );
}
