import { Link } from 'react-router-dom';
import AiStatus from './AiStatus';
import { formatToday } from '../lib/format';

export default function Masthead({ aiStatus = null, compact = false }) {
  const now = new Date();
  const isoDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  return (
    <header>
      <div className="border-b border-rule">
        <div className="container-editorial flex items-center justify-between gap-4 py-2.5">
          <time dateTime={isoDate} className="eyebrow text-ink-muted">
            {formatToday()}
          </time>
          <div className="flex items-center gap-5">
            <span className="eyebrow hidden text-ink-muted sm:block">
              Édition satirique
            </span>
            <Link
              to="/#methode"
              className="eyebrow text-ink transition-colors hover:text-vermillion"
            >
              La méthode
            </Link>
          </div>
        </div>
      </div>

      <div
        className={`container-editorial ${compact ? 'pt-5 pb-4 md:pt-7 md:pb-5' : 'pt-8 pb-5 md:pt-12 md:pb-7'}`}
      >
        <div className="flex items-start justify-between gap-6">
          <Link
            to="/"
            aria-label="SardocheMètre, retour à l’accueil"
            className="inline-block"
          >
            <span
              className={`block pt-1 font-title font-medium tracking-[-0.055em] text-ink uppercase ${
                compact
                  ? 'text-[2.1rem] leading-[0.9] md:text-[3.25rem]'
                  : 'text-[clamp(2.3rem,8.4vw,7rem)] leading-[0.95]'
              }`}
            >
              Sardoche
              <span className="font-normal italic">mètre</span>
              <span className="text-vermillion">.</span>
            </span>
          </Link>

          <div className="hidden shrink-0 flex-col items-end gap-2 pt-1 lg:flex">
            <AiStatus status={aiStatus} />
            <span className="eyebrow text-ink-muted">Données réelles · API</span>
          </div>
        </div>

        {!compact && (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-muted md:mt-5 md:text-base">
            Le bullshit des tweets de Sardoche, passé au crible.
          </p>
        )}
      </div>

      <div aria-hidden="true" className="border-t border-ink" />
      <div aria-hidden="true" className="mt-[3px] border-t border-ink" />
    </header>
  );
}
