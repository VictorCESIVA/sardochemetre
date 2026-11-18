import { Link } from 'react-router-dom';
import { IconArrowUpRight } from './Icons';
import { BACKEND_HEALTH_URL } from '../services/tweetService';

export default function ErrorState({
  title = 'Impossible de charger les archives',
  message,
  hint,
  onRetry,
  retryLabel = 'Réessayer',
  homeLink = false,
  homeLabel = 'Retour aux archives',
  showBackendLink = true,
}) {
  return (
    <div role="alert" className="surface-card px-5 py-10 md:px-8 md:py-14">
      <p className="eyebrow text-verdict-bullshit">Transmission interrompue</p>
      <h1 className="mt-4 max-w-3xl font-title text-3xl leading-[1.03] tracking-[-0.05em] text-ink uppercase md:text-5xl">{title}</h1>
      {message && <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-muted md:text-base">{message}</p>}
      {hint && <p className="mt-2 max-w-xl text-xs leading-relaxed text-ink-muted">{hint}</p>}
      <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
        {onRetry && <button type="button" onClick={onRetry} className="btn-primary">{retryLabel}</button>}
        {showBackendLink && (
          <a href={BACKEND_HEALTH_URL} target="_blank" rel="noopener noreferrer" className="link-editorial text-ink">
            Vérifier le backend<IconArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
        {homeLink && <Link to="/" className="link-editorial text-ink">{homeLabel}</Link>}
      </div>
    </div>
  );
}
