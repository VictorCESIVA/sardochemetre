import { Link } from 'react-router-dom';
import Footer from './Footer';
import Masthead from './Masthead';
import { IconArrowRight } from './Icons';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Masthead compact />

      <main id="main-content" className="flex-1">
        <div className="container-editorial py-14 md:py-24">
          <p className="eyebrow text-vermillion">Erreur 404 · Hors édition</p>

          <p
            aria-hidden="true"
            className="mt-2 font-title text-[clamp(7rem,25vw,16rem)] leading-[0.72] tracking-[-0.08em] text-ink"
          >
            404
          </p>

          <div className="mt-6 grid gap-8 border-t border-ink pt-8 md:grid-cols-2 md:gap-16">
            <h1 className="font-title text-4xl leading-[1.05] tracking-[-0.035em] text-ink md:text-5xl">
              Cette page n’existe pas.
            </h1>
            <div>
              <p className="max-w-md text-sm leading-relaxed text-ink-muted md:text-base">
                Le lien est cassé, la page a été déplacée, ou elle n’a jamais
                existé. C’est le seul bullshit que le SardocheMètre n’arrive pas
                à noter.
              </p>
              <Link to="/" className="link-editorial mt-6 text-ink">
                Retour aux archives
                <IconArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
