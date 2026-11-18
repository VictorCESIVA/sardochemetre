import { Link } from 'react-router-dom';
import AiStatus from './AiStatus';

export default function Masthead({ aiStatus = null }) {
  return (
    <header className="relative z-20 border-b border-rule bg-paper/95">
      <div className="container-editorial flex h-[76px] items-center justify-between gap-6">
        <Link
          to="/"
          aria-label="SardocheMètre, retour à l’accueil"
          className="group flex shrink-0 items-center gap-3"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-vermillion font-title text-[11px] tracking-[-0.08em] text-paper transition-transform group-hover:-rotate-3">
            S/M
          </span>
          <span className="font-title text-[15px] tracking-[-0.055em] text-ink uppercase sm:text-[17px]">
            Sardoche<span className="text-vermillion">mètre</span>
          </span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden md:block">
          <ul className="flex items-center gap-7">
            <li>
              <Link to="/#barometre" className="eyebrow text-ink-muted transition-colors hover:text-ink">
                Le baromètre
              </Link>
            </li>
            <li>
              <Link to="/#archives" className="eyebrow text-ink-muted transition-colors hover:text-ink">
                Les analyses
              </Link>
            </li>
            <li>
              <Link to="/#methode" className="eyebrow text-ink-muted transition-colors hover:text-ink">
                La méthode
              </Link>
            </li>
          </ul>
        </nav>

        <div className="hidden lg:block">
          <AiStatus status={aiStatus} />
        </div>
        <span className="eyebrow text-ink-muted md:hidden">Satire, pas science.</span>
        <span className="eyebrow hidden text-ink-muted md:block lg:hidden">Édition satirique</span>
      </div>
    </header>
  );
}
