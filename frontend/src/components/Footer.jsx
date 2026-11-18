import { Link } from 'react-router-dom';
import AiStatus from './AiStatus';

export default function Footer({ aiStatus = null }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-rule">
      <div className="container-editorial py-10 md:py-12">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <Link to="/" className="font-title text-xl tracking-[-0.055em] text-ink uppercase">
              Sardoche<span className="text-vermillion">mètre</span><span className="text-vermillion">.</span>
            </Link>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-muted">
              Site satirique, non affilié à Sardoche. Les analyses sont générées par IA et peuvent contenir des erreurs : elles ne constituent pas un fact-checking professionnel.
            </p>
          </div>
          <div className="flex flex-col gap-4 md:items-end">
            <nav aria-label="Navigation de pied de page" className="flex flex-wrap gap-x-5 gap-y-2 md:justify-end">
              <Link to="/#barometre" className="eyebrow text-ink-muted hover:text-vermillion">Baromètre</Link>
              <Link to="/#archives" className="eyebrow text-ink-muted hover:text-vermillion">Analyses</Link>
              <Link to="/#methode" className="eyebrow text-ink-muted hover:text-vermillion">Méthode</Link>
            </nav>
            <AiStatus status={aiStatus} />
          </div>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
          <p className="eyebrow text-ink-muted">© {year} SardocheMètre · Édition satirique</p>
          <p className="eyebrow text-ink-muted">On commente les tweets, pas la personne.</p>
        </div>
      </div>
    </footer>
  );
}
