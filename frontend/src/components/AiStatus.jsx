export default function AiStatus({ status = null, className = '' }) {
  const configured = status?.configured === true;
  const unavailable = status?.configured === false;

  if (!configured && !unavailable) return null;

  const dotClass = configured ? 'bg-verdict-true' : 'bg-verdict-doubt';
  const stateLabel = configured ? 'configurée' : 'non configurée';
  const title = unavailable
    ? 'IA OpenCode non configurée : ajoutez OPENCODE_API_KEY dans backend/.env.'
    : 'IA OpenCode configurée.';

  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-[10px] leading-relaxed tracking-[0.12em] text-ink-muted uppercase ${className}`}
      title={title}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 ${dotClass}`} />
      <span>IA OpenCode · DeepSeek V4.1 Flash</span>
      <span className="sr-only">— {stateLabel}</span>
    </span>
  );
}
