import { normalizeScore } from '../lib/tweetUtils';

const TICKS = [0, 25, 50, 75, 100];

function colorForScore(score) {
  if (score >= 75) return 'bg-verdict-hot';
  if (score >= 50) return 'bg-verdict-bullshit';
  if (score >= 25) return 'bg-verdict-doubt';
  return 'bg-verdict-true';
}

export default function ScoreGauge({
  score = 0,
  label = 'Indice de bullshit',
  className = '',
}) {
  const safeScore = normalizeScore(score, 0);
  const rounded = Math.round(safeScore);

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
      aria-valuetext={`${rounded} sur 100`}
      aria-label={label}
      className={`w-full ${className}`}
    >
      <div className="h-[7px] border border-rule bg-paper-alt p-[1px]">
        <div
          className={`h-full transition-[width] duration-700 ease-out ${colorForScore(safeScore)}`}
          style={{ width: `${safeScore}%` }}
        />
      </div>

      <div className="mt-1 flex justify-between" aria-hidden="true">
        {TICKS.map((tick) => (
          <span key={tick} className="h-1.5 w-px bg-ink-muted" />
        ))}
      </div>

      <div
        className="mt-1 flex justify-between font-mono text-[9px] leading-none text-ink-muted"
        aria-hidden="true"
      >
        {TICKS.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  );
}
