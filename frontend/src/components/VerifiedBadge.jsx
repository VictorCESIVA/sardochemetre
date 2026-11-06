export default function VerifiedBadge({ size = 16, className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      role="img"
      aria-label="Compte vérifié"
      title="Compte vérifié"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="10" fill="var(--color-x-blue)" />
        <path
          d="m7.4 12.2 3 3 6.2-6.4"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
