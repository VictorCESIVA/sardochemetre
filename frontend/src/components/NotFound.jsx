import { Link } from 'react-router-dom';
import Footer from './Footer';
import Masthead from './Masthead';
import { IconArrowRight } from './Icons';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Masthead compact />
      <main id="main-content" className="flex-1">
        <div className="container-editorial py-12 md:py-20">
          <section className="surface-card overflow-hidden px-5 py-12 md:px-10 md:py-16">
            <p className="eyebrow text-vermillion">Erreur 404 · Hors sujet</p>
            <p aria-hidden="true" className="display-title mt-8 text-[clamp(7rem,25vw,16rem)] text-ink">404</p>
            <div className="mt-8 grid gap-8 border-t border-rule pt-8 md:grid-cols-2 md:gap-16">
              <h1 className="font-title text-3xl leading-[1.03] tracking-[-0.05em] text-ink uppercase md:text-4xl">Cette page n’existe pas.</h1>
              <div>
                <p className="max-w-md text-sm leading-relaxed text-ink-muted md:text-base">Le lien est cassé ou la page n’a jamais existé. C’est le seul bullshit que le SardocheMètre n’arrive pas à noter.</p>
                <Link to="/" className="btn-primary mt-7">Retour aux analyses<IconArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
