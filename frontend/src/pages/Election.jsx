import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as tweetService from '../services/tweetService';
import { levelForScore } from '../lib/tweetUtils';
import { formatNumber } from '../lib/format';
import {
  ErrorState,
  Footer,
  Loading,
  Masthead,
  PeriodTabs,
  SectionLabel,
  TrendChart,
  TweetRow,
} from '../components';
import { IconArrowRight } from '../components/Icons';

const PERIOD_LABELS = {
  day: 'Aujourd’hui',
  week: 'Cette semaine',
  month: 'Ce mois',
  all: 'Tout l’historique',
};

const TYPE_LABELS = {
  candidat: 'Candidat',
  parti: 'Parti',
  institution: 'Institution',
  personnalité: 'Personnalité',
};

const STANCE_BARS = [
  { key: 'soutien', label: 'Soutiens', barClass: 'bg-verdict-true' },
  { key: 'attaque', label: 'Attaques', barClass: 'bg-vermillion' },
  { key: 'neutre', label: 'Non tranchés', barClass: 'bg-ink-muted' },
];

function describeLoadError(error) {
  const status = error?.status ?? error?.response?.status;

  if (error?.code === 'ECONNABORTED') {
    return 'Le backend met trop de temps à répondre. Vérifiez qu’il est bien démarré, puis réessayez.';
  }
  if (status) {
    return `Le backend a répondu avec une erreur ${status}. Réessayez dans un instant.`;
  }
  return (
    error?.message ||
    'Une erreur inattendue est survenue pendant le chargement du dossier.'
  );
}

function MentionRow({ mention }) {
  const total = Math.max(1, mention.total);

  return (
    <li className="border-t border-rule py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-sans text-sm font-semibold text-ink">{mention.label}</p>
        <span className="font-mono text-[9px] tracking-[0.1em] text-ink-muted uppercase">
          {TYPE_LABELS[mention.type] ?? 'Personnalité'}
        </span>
      </div>
      <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-rule/60">
        {STANCE_BARS.map(({ key, barClass }) => (
          <span
            key={key}
            className={barClass}
            style={{ width: `${(mention[key] / total) * 100}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] text-ink-muted">
        <div className="flex items-baseline gap-1.5">
          <dt>{formatNumber(mention.total)} mention{mention.total > 1 ? 's' : ''}</dt>
        </div>
        {STANCE_BARS.map(({ key, label }) => (
          <div key={key} className="flex items-baseline gap-1.5">
            <dt>{label}</dt>
            <dd className="text-ink">{formatNumber(mention[key])}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function Election() {
  const [period, setPeriod] = useState('all');
  const [board, setBoard] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [profile, setProfile] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    tweetService
      .getAIStatus()
      .then((status) => {
        if (!cancelled) setAiStatus(status);
      })
      .catch(() => {
        if (!cancelled) setAiStatus(null);
      });

    tweetService
      .getProfile()
      .then((nextProfile) => {
        if (!cancelled) setProfile(nextProfile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBoard() {
      setLoading(true);
      setError(null);

      try {
        const nextBoard = await tweetService.getElectionBoard(period);
        if (!cancelled) setBoard(nextBoard);
      } catch (loadError) {
        if (cancelled) return;
        console.error('Erreur lors du chargement du dossier élection :', loadError);
        setError(loadError);
        setBoard(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBoard();

    return () => {
      cancelled = true;
    };
  }, [period, retryKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrend() {
      try {
        const data = await tweetService.getHistory(period, 'week');
        if (!cancelled) setHistory(data);
      } catch (trendError) {
        console.error('Courbe indisponible :', trendError);
        if (!cancelled) setHistory(null);
      }
    }

    loadTrend();

    return () => {
      cancelled = true;
    };
  }, [period, retryKey]);

  const politicalShare = useMemo(() => {
    if (!board || board.totalAnalyzed === 0) return 0;
    return Math.round((board.politicalCount / board.totalAnalyzed) * 100);
  }, [board]);

  const periodLabel = PERIOD_LABELS[period] || PERIOD_LABELS.all;

  const handlePeriodChange = (nextPeriod) => {
    setPeriod(nextPeriod);
  };

  const handleRetry = () => {
    setRetryKey((key) => key + 1);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Masthead aiStatus={aiStatus} />

      <main id="main-content" className="flex-1" aria-busy={loading}>
        <div className="container-editorial py-8 md:py-12">
          {loading ? (
            <Loading rows={6} />
          ) : error ? (
            <ErrorState
              title="Impossible de charger le dossier élection"
              message={describeLoadError(error)}
              hint="Le SardocheMètre a besoin du backend pour agréger les tweets politiques. Lancez-le, puis réessayez."
              onRetry={handleRetry}
            />
          ) : (
            <>
              <section aria-labelledby="election-title">
                <SectionLabel>Dossier · Présidentielle 2027</SectionLabel>
                <h1 id="election-title" className="display-title mt-6 text-[clamp(2.8rem,6.4vw,5.6rem)] text-ink">
                  « Apartisan ».<br />
                  <span className="text-vermillion">En campagne.</span>
                </h1>
                <p className="mt-7 max-w-2xl text-base leading-relaxed text-ink-muted md:text-lg">
                  Premier rang de l’université d’été de Reconquête aux côtés
                  d’Éric Zemmour et Sarah Knafo, soutien affiché de David
                  Lisnard, rêve assumé de devenir député : à cinq mois du premier
                  tour, le streamer « en recherche &amp; développement
                  politique » tweete beaucoup sur la présidentielle. On passe
                  ces tweets au SardocheMètre, comme les autres.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-5">
                  <Link to="/#archives" className="btn-primary">
                    Toutes les analyses<IconArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href="#mentions"
                    className="link-editorial text-ink-muted"
                  >
                    Qui est mentionné<span aria-hidden="true">↘</span>
                  </a>
                </div>
              </section>

              <div className="mt-10 flex flex-col gap-4 md:mt-12 lg:flex-row lg:items-center lg:justify-between">
                <PeriodTabs value={period} onChange={handlePeriodChange} />
                <p role="status" aria-live="polite" className="font-mono text-[10px] leading-relaxed text-ink-muted">
                  {formatNumber(board?.politicalCount ?? 0)} tweet
                  {(board?.politicalCount ?? 0) > 1 ? 's' : ''} politique
                  {(board?.politicalCount ?? 0) > 1 ? 's' : ''} analysé
                  {(board?.politicalCount ?? 0) > 1 ? 's' : ''} · {periodLabel}
                </p>
              </div>

              <section aria-label="Indicateurs du dossier" className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="surface-card p-5 md:p-6">
                  <p className="eyebrow text-ink-muted">Tweets politiques</p>
                  <p className="mt-3 font-title text-4xl leading-none tracking-[-0.05em] tabular-nums text-ink">
                    {formatNumber(board?.politicalCount ?? 0)}
                  </p>
                  <p className="mt-3 font-mono text-[10px] text-ink-muted">
                    {politicalShare}% des tweets analysés
                  </p>
                </div>
                <div className="surface-card p-5 md:p-6">
                  <p className="eyebrow text-ink-muted">Bullshit moyen du dossier</p>
                  <p className="mt-3 font-title text-4xl leading-none tracking-[-0.05em] tabular-nums text-ink">
                    {Math.round(board?.avgPoliticalScore ?? 0)}
                    <span className="ml-1 font-mono text-[10px] tracking-normal text-ink-muted">/100</span>
                  </p>
                  <p className="mt-3 font-mono text-[10px] text-ink-muted">
                    {levelForScore(board?.avgPoliticalScore ?? 0)}
                  </p>
                </div>
                <div className="surface-card p-5 md:p-6">
                  <p className="eyebrow text-ink-muted">Personnalités suivies</p>
                  <p className="mt-3 font-title text-4xl leading-none tracking-[-0.05em] tabular-nums text-ink">
                    {formatNumber(board?.mentions.length ?? 0)}
                  </p>
                  <p className="mt-3 font-mono text-[10px] text-ink-muted">
                    candidats, partis et institutions
                  </p>
                </div>
              </section>

              <section aria-label="Courbe du dossier" className="surface-card mt-4 p-5 md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <p className="eyebrow text-vermillion">La courbe du dossier</p>
                  <p className="font-mono text-[10px] text-ink-muted">
                    Bullshit moyen des tweets politiques, par semaine
                  </p>
                </div>
                <div className="mt-5">
                  <TrendChart
                    points={history?.points ?? []}
                    bucket="week"
                    series="both"
                  />
                </div>
              </section>

              <section
                id="mentions"
                aria-labelledby="mentions-title"
                className="mt-16 scroll-mt-8"
              >
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow text-vermillion">Le carnet d’adresses</p>
                    <h2 id="mentions-title" className="mt-2 font-title text-3xl leading-none tracking-[-0.055em] text-ink uppercase md:text-4xl">
                      Qui il cite, qui il charge.
                    </h2>
                  </div>
                  <p className="max-w-sm font-mono text-[10px] leading-relaxed text-ink-muted">
                    Ton déterminé par l’IA sur la base du tweet : soutien,
                    attaque ou non tranché. Sans IA, les mentions restent
                    « non tranchées ».
                  </p>
                </div>

                <div className="surface-card mt-7 p-5 md:p-8">
                  {board && board.mentions.length > 0 ? (
                    <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {board.mentions.map((mention) => (
                        <MentionRow key={mention.label} mention={mention} />
                      ))}
                    </ul>
                  ) : (
                    <p className="py-8 text-center text-sm text-ink-muted">
                      Aucune personnalité politique détectée {periodLabel.toLowerCase()}.
                      Le prochain débat devrait arranger ça.
                    </p>
                  )}
                </div>
              </section>

              <section aria-labelledby="political-title" className="mt-16">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow text-vermillion">Les dossiers du dossier</p>
                    <h2 id="political-title" className="mt-2 font-title text-3xl leading-none tracking-[-0.055em] text-ink uppercase md:text-4xl">
                      Tweets en campagne.
                    </h2>
                  </div>
                </div>

                <div className="mt-7 grid items-stretch gap-4 lg:grid-cols-2">
                  {board && board.tweets.length > 0 ? (
                    board.tweets.map((tweet, index) => (
                      <TweetRow
                        key={tweet.id ?? `political-${index}`}
                        tweet={tweet}
                        profile={profile}
                        index={index + 1}
                      />
                    ))
                  ) : (
                    <div className="surface-card px-5 py-12 text-center md:px-8 md:py-16 lg:col-span-2">
                      <p className="eyebrow text-vermillion">Dossier élection · 0 résultat</p>
                      <h3 className="mx-auto mt-4 max-w-xl font-title text-2xl leading-[1.05] tracking-[-0.05em] text-ink uppercase">
                        Rien à fact-checker {periodLabel.toLowerCase()}.
                      </h3>
                      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
                        Aucun tweet politique analysé sur cette période. Élargissez
                        la période, ou attendez le prochain cycle de collecte.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section aria-label="Avertissement" className="surface-card mt-16 p-5 md:p-8">
                <p className="eyebrow text-ink-muted">Comment ce dossier est fabriqué</p>
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-muted">
                  Un tweet est marqué « politique » s’il cite l’élection, un
                  candidat, un parti, une institution ou un thème du débat
                  public (retraites, déficit, immigration…). La détection est
                  d’abord lexicale et tourne sans clé IA ; l’analyse affinera
                  ensuite le marquage et le ton envers chaque personnalité
                  mentionnée. L’IA reste faillible : un ton peut être mal lu,
                  une mention manquée. On commente des tweets publics, jamais
                  la personne.
                </p>
              </section>
            </>
          )}
        </div>
      </main>

      <Footer aiStatus={aiStatus} />
    </div>
  );
}

export default Election;
