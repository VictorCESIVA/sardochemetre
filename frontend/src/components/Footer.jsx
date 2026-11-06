import { Link } from 'react-router-dom';
import AiStatus from './AiStatus';

export default function Footer({ aiStatus = null }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-ink">
      <div className="container-editorial py-10 md:py-12">
        <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            <p className="font-title text-2xl leading-none tracking-[-0.04em] text-ink uppercase">
              Sardoche<span className="font-normal italic">mètre</span>
              <span className="text-vermillion">.</span>
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
              Site satirique. Analyses générées par IA. Non affilié à Sardoche.
            </p>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-ink-muted">
              Les scores et verdicts relèvent de l’humour et de l’esprit
              critique. Ils ne constituent ni une vérité judiciaire ni un
              certificat de sincérité.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:items-end">
            <Link
              to="/#methode"
              className="font-mono text-[10px] tracking-[0.14em] text-ink uppercase transition-colors hover:text-vermillion"
            >
              La méthode
            </Link>
            <AiStatus status={aiStatus} />
            <p className="eyebrow text-ink-muted">© {year} SardocheMètre</p>
          </div>
        </div>
      </div>

      <div className="border-t border-rule">
        <div className="container-editorial flex flex-wrap items-center justify-between gap-2 py-4">
          <p className="eyebrow text-ink-muted">Édition satirique · données réelles</p>
          <p className="eyebrow text-ink-muted">
            Un doute raisonnable, à la virgule près.
          </p>
        </div>
      </div>
    </footer>
  );
}
