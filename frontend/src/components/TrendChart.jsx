/**
 * Hand-rolled SVG trend chart for the BullshitMètre history.
 * Two series: the global average score (solid, paper-toned) and the
 * political tweets average (dashed, accent). No chart library: the
 * editorial design stays consistent and the bundle stays light.
 */
const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 200;
const PADDING = { top: 14, right: 10, bottom: 26, left: 30 };

const GRID_LINES = [25, 50, 75];

function scaleX(count, index) {
  const innerWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  if (count <= 1) return PADDING.left + innerWidth / 2;
  return PADDING.left + (innerWidth * index) / (count - 1);
}

function scaleY(score) {
  const innerHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  return PADDING.top + innerHeight * (1 - Math.min(100, Math.max(0, score)) / 100);
}

function buildLine(points, key) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${scaleX(points.length, index).toFixed(1)} ${scaleY(
          point[key],
        ).toFixed(1)}`,
    )
    .join(' ');
}

function buildArea(points) {
  if (points.length === 0) return '';
  const bottom = VIEW_HEIGHT - PADDING.bottom;
  const top = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${scaleX(points.length, index).toFixed(1)} ${scaleY(
          point.avgScore,
        ).toFixed(1)}`,
    )
    .join(' ');

  const last = scaleX(points.length, points.length - 1);
  const first = scaleX(points.length, 0);

  return `${top} L ${last.toFixed(1)} ${bottom} L ${first.toFixed(1)} ${bottom} Z`;
}

function formatBucketDate(date, bucket) {
  if (bucket === 'month') {
    return date.slice(0, 7);
  }
  return date.slice(5);
}

const BUCKET_LABELS = {
  day: 'par jour',
  week: 'par semaine',
  month: 'par mois',
};

export default function TrendChart({ points = [], bucket = 'week', series = 'both' }) {
  const showGlobal = series === 'both' || series === 'global';
  const showPolitical = series === 'both' || series === 'political';

  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        Pas encore assez de données pour tracer la courbe. Revenez après la
        prochaine collecte.
      </p>
    );
  }

  const politicalPoints = points.filter((point) => point.hasPolitical);
  const first = points[0];
  const last = points[points.length - 1];
  const delta = Math.round(last.avgScore - first.avgScore);
  const trend = delta === 0 ? 'stable' : delta > 0 ? `+${delta}` : String(delta);

  const ariaSummary =
    `Indice de bullshit ${BUCKET_LABELS[bucket] || 'dans le temps'} : ` +
    `${Math.round(first.avgScore)} au début, ${Math.round(last.avgScore)} en dernière mesure` +
    ` (${trend} points). ${points.length} mesures.`;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={ariaSummary}
        className="block h-auto w-full"
      >
        <title>{ariaSummary}</title>

        {GRID_LINES.map((line) => (
          <g key={line}>
            <line
              x1={PADDING.left}
              x2={VIEW_WIDTH - PADDING.right}
              y1={scaleY(line)}
              y2={scaleY(line)}
              stroke="var(--color-rule)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
            <text
              x={PADDING.left - 6}
              y={scaleY(line) + 3}
              textAnchor="end"
              className="fill-ink-muted"
              style={{ font: '10px monospace' }}
            >
              {line}
            </text>
          </g>
        ))}

        {showGlobal && (
          <>
            <path
              d={buildArea(points)}
              fill="var(--color-paper-alt)"
              opacity="0.9"
            />
            <path
              d={buildLine(points, 'avgScore')}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((point, index) => (
              <circle
                key={`g-${point.date}`}
                cx={scaleX(points.length, index)}
                cy={scaleY(point.avgScore)}
                r="2.5"
                fill="var(--color-ink)"
              />
            ))}
          </>
        )}

        {showPolitical && politicalPoints.length > 0 && (
          <path
            d={buildLine(politicalPoints, 'avgPoliticalScore')}
            fill="none"
            stroke="var(--color-vermillion)"
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        <text
          x={scaleX(points.length, 0)}
          y={VIEW_HEIGHT - 8}
          textAnchor="middle"
          className="fill-ink-muted"
          style={{ font: '10px monospace' }}
        >
          {formatBucketDate(first.date, bucket)}
        </text>
        <text
          x={scaleX(points.length, points.length - 1)}
          y={VIEW_HEIGHT - 8}
          textAnchor="middle"
          className="fill-ink-muted"
          style={{ font: '10px monospace' }}
        >
          {formatBucketDate(last.date, bucket)}
        </text>
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] text-ink-muted">
        {showGlobal && (
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-0.5 w-5 bg-ink" />
            Tous les tweets
          </span>
        )}
        {showPolitical && politicalPoints.length > 0 && (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-5 border-t-2 border-dashed border-vermillion"
            />
            Tweets politiques
          </span>
        )}
        <span className="ml-auto">
          Dernière mesure : {Math.round(last.avgScore)}/100 ·{' '}
          {BUCKET_LABELS[bucket] || BUCKET_LABELS.week}
        </span>
      </figcaption>
    </figure>
  );
}
