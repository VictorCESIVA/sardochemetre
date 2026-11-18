import { useEffect, useMemo, useRef, useState } from 'react';
import * as tweetService from '../services/tweetService';
import {
  filterByPeriod,
  matchesQuery,
  normalizeBullshitmetre,
  normalizeStats,
  normalizeTweet,
  paginateTweets,
} from '../lib/tweetUtils';
import { formatNumber } from '../lib/format';
import {
  ErrorState,
  Footer,
  LeadStory,
  Loading,
  Masthead,
  Pagination,
  PeriodTabs,
  ScoreGauge,
  SearchField,
  SectionLabel,
  StatStrip,
  TweetRow,
  VerdictBreakdown,
} from '../components';
import { IconArrowRight } from '../components/Icons';

const PAGE_SIZE = 12;

const PERIOD_LABELS = {
  day: 'Aujourd’hui',
  week: 'Cette semaine',
  month: 'Ce mois',
  all: 'Tout l’historique',
};

function normalizeListPagination(data, requestedPage) {
  const source = data || {};
  const paginationSource =
    source.pagination && typeof source.pagination === 'object'
      ? source.pagination
      : {};

  const total = Math.max(0, Number(source.total ?? paginationSource.total) || 0);
  const limit = Math.max(
    1,
    Number(source.limit ?? paginationSource.limit ?? PAGE_SIZE) || PAGE_SIZE,
  );
  const page = Math.max(
    1,
    Number(paginationSource.page ?? source.page ?? requestedPage) ||
      requestedPage,
  );
  const rawTotalPages = Number(
    source.totalPages ?? paginationSource.totalPages,
  );
  const totalPages =
    Number.isFinite(rawTotalPages) && rawTotalPages > 0
      ? rawTotalPages
      : total > 0
        ? Math.ceil(total / limit)
        : 0;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext:
      typeof paginationSource.hasNext === 'boolean'
        ? paginationSource.hasNext
        : page < totalPages,
    hasPrev:
      typeof paginationSource.hasPrev === 'boolean'
        ? paginationSource.hasPrev
        : page > 1,
  };
}

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
    'Une erreur inattendue est survenue pendant le chargement des archives.'
  );
}

function scrollToArchives() {
  const target = document.getElementById('archives');
  if (!target) return;

  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  target.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  });
}

function MethodAside({ score, sample, periodLabel }) {
  const steps = [
    ['01', 'On lit', 'Le tweet est récupéré tel quel, avec son contexte et ses médias.'],
    ['02', 'On recoupe', 'L’IA isole les affirmations et les confronte aux faits disponibles.'],
    ['03', 'On note', 'De 0 à 100, avec un verdict, une explication et une pointe d’humour.'],
  ];

  return (
    <section id="methode" aria-labelledby="method-title" className="surface-card mt-16 scroll-mt-8 p-5 md:p-8 lg:p-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-12">
        <div>
          <p className="eyebrow text-vermillion">La méthode</p>
          <h2 id="method-title" className="mt-4 font-title text-3xl leading-[1.02] tracking-[-0.055em] text-ink uppercase md:text-4xl">
            Une IA.<br />Trois étapes.<br />Zéro langue de bois.
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-muted">
            Un outil satirique pour lire les tweets autrement. Les analyses peuvent se tromper : l’esprit critique reste obligatoire.
          </p>
        </div>

        <div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {steps.map(([number, title, text]) => (
              <li key={number} className="rounded-2xl border border-rule p-4">
                <span className="font-mono text-xs text-vermillion">{number}</span>
                <h3 className="mt-5 font-sans text-base font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">{text}</p>
              </li>
            ))}
          </ol>
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-rule pt-5">
            <div className="flex items-baseline gap-2"><dt className="eyebrow text-ink-muted">Score affiché</dt><dd className="font-mono text-xs text-ink">{Math.round(score)}/100</dd></div>
            <div className="flex items-baseline gap-2"><dt className="eyebrow text-ink-muted">Échantillon</dt><dd className="font-mono text-xs text-ink">{formatNumber(sample)}</dd></div>
            <div className="flex items-baseline gap-2"><dt className="eyebrow text-ink-muted">Période</dt><dd className="font-mono text-xs text-ink">{periodLabel}</dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}

function EmptyArchive({ title, message, children }) {
  return (
    <div className="surface-card px-5 py-12 text-center md:px-8 md:py-16">
      <p className="eyebrow text-vermillion">Archives · 0 résultat</p>
      <h2 className="mx-auto mt-4 max-w-2xl font-title text-3xl leading-[1.03] tracking-[-0.05em] text-balance text-ink uppercase md:text-4xl">
        {title}
      </h2>
      <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">{message}</p>
      {children && <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{children}</div>}
    </div>
  );
}

function Home() {
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [stats, setStats] = useState(null);
  const [globalScore, setGlobalScore] = useState(null);
  const [tweets, setTweets] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [profile, setProfile] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const hasLoadedRef = useRef(false);

  const isSearching = debouncedQuery.length > 0;
  const periodLabel = PERIOD_LABELS[period] || PERIOD_LABELS.all;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    tweetService
      .getAIStatus()
      .then((status) => {
        if (!cancelled) setAiStatus(status);
      })
      .catch((statusError) => {
        if (cancelled) return;
        console.error('Statut IA indisponible :', statusError);
        setAiStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  useEffect(() => {
    let cancelled = false;

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
  }, [retryKey]);

  useEffect(() => {
    let cancelled = false;
    const firstLoad = !hasLoadedRef.current;

    if (firstLoad) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    async function load() {
      const fallbackSearch = async () => {
        const results = await tweetService.searchTweets(debouncedQuery);
        return paginateTweets(
          filterByPeriod(results, period),
          page,
          PAGE_SIZE,
        );
      };

      try {
        const [scoreData, statsData] = await Promise.all([
          tweetService.getBullshitmetre(period),
          tweetService.getStats(period),
        ]);

        let listData;
        try {
          listData = await tweetService.getTweets(
            page,
            PAGE_SIZE,
            period,
            debouncedQuery,
          );

          if (debouncedQuery) {
            const received = Array.isArray(listData?.tweets)
              ? listData.tweets
              : [];
            const hasMatch = received.some((tweet) =>
              matchesQuery(tweet, debouncedQuery),
            );

            if (received.length > 0 && !hasMatch) {
              console.error(
                'Le backend a ignoré le filtre de recherche, repli sur /api/tweets/search.',
              );
              listData = await fallbackSearch();
            }
          }
        } catch (listError) {
          if (!debouncedQuery) throw listError;

          console.error(
            'Recherche paginée indisponible, repli sur /api/tweets/search :',
            listError,
          );
          listData = await fallbackSearch();
        }

        if (cancelled) return;

        const nextPagination = normalizeListPagination(listData, page);

        if (nextPagination.total > 0 && page > nextPagination.totalPages) {
          setGlobalScore(scoreData || null);
          setStats(statsData || null);
          setPage(nextPagination.totalPages);
          return;
        }

        if (nextPagination.total === 0 && page > 1) {
          setGlobalScore(scoreData || null);
          setStats(statsData || null);
          setPage(1);
          return;
        }

        setGlobalScore(scoreData || null);
        setStats(statsData || null);
        setTweets(
          (Array.isArray(listData?.tweets) ? listData.tweets : [])
            .map(normalizeTweet)
            .filter(Boolean),
        );
        setPagination(nextPagination);
        hasLoadedRef.current = true;
      } catch (fetchError) {
        if (cancelled) return;
        console.error('Erreur lors du chargement des données :', fetchError);
        setError(fetchError);
        setTweets([]);
        setPagination(null);
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [period, page, debouncedQuery, retryKey]);

  const normalizedStats = useMemo(
    () => (stats ? normalizeStats(stats, period) : null),
    [stats, period],
  );

  const normalizedBullshitmetre = useMemo(
    () => (globalScore ? normalizeBullshitmetre(globalScore, period) : null),
    [globalScore, period],
  );

  const leadTweet = useMemo(() => {
    let best = null;
    let bestScore = -1;

    tweets.forEach((tweet) => {
      const score = Number(tweet.bullshit_score);
      if (Number.isFinite(score) && score > bestScore) {
        best = tweet;
        bestScore = score;
      }
    });

    return best;
  }, [tweets]);

  const score = normalizedBullshitmetre?.globalScore ?? 0;
  const sampleSize =
    normalizedBullshitmetre?.sampleSize ??
    normalizedStats?.totalAnalyzed ??
    0;
  const totalResults = pagination?.total ?? tweets.length;

  const handlePeriodChange = (nextPeriod) => {
    setPeriod(nextPeriod);
    setPage(1);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setDebouncedQuery(query.trim());
    setPage(1);
  };

  const handleClearSearch = () => {
    setQuery('');
    setDebouncedQuery('');
    setPage(1);
  };

  const handleRetry = () => {
    setRetryKey((key) => key + 1);
  };

  const goToPage = (nextPage) => {
    if (!pagination || nextPage < 1 || nextPage > pagination.totalPages) return;
    setPage(nextPage);
    window.requestAnimationFrame(scrollToArchives);
  };

  const renderResults = () => (
    <section id="archives" aria-labelledby="archives-title" className="mt-16 scroll-mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-vermillion">Les archives</p>
          <h2 id="archives-title" className="mt-2 font-title text-3xl leading-none tracking-[-0.055em] text-ink uppercase md:text-4xl">
            {isSearching ? 'Résultats.' : 'Tous les dossiers.'}
          </h2>
        </div>
        <p role="status" aria-live="polite" className="max-w-full font-mono text-[10px] leading-relaxed text-ink-muted">
          {isSearching
            ? `${formatNumber(totalResults)} résultat${totalResults > 1 ? 's' : ''} pour « ${debouncedQuery} »`
            : `${formatNumber(totalResults)} tweet${totalResults > 1 ? 's' : ''} · ${periodLabel}`}
        </p>
      </div>

      <div className={`mt-7 grid items-stretch gap-4 lg:grid-cols-2 ${refreshing ? 'opacity-60' : 'opacity-100'} transition-opacity`}>
        {tweets.map((tweet, index) => (
          <TweetRow
            key={tweet.id ?? `tweet-${index}`}
            tweet={tweet}
            profile={profile}
            index={(pagination?.page ? pagination.page - 1 : 0) * PAGE_SIZE + index + 1}
          />
        ))}
      </div>

      <Pagination
        page={pagination?.page ?? page}
        totalPages={pagination?.totalPages ?? 1}
        hasPrev={pagination?.hasPrev ?? false}
        hasNext={pagination?.hasNext ?? false}
        onPageChange={goToPage}
      />
    </section>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Masthead aiStatus={aiStatus} />

      <main
        id="main-content"
        className="flex-1"
        aria-busy={initialLoading || refreshing}
      >
        <div className="container-editorial py-8 md:py-12">
          {initialLoading ? (
            <Loading rows={7} />
          ) : error ? (
            <ErrorState
              title="Impossible de charger les archives"
              message={describeLoadError(error)}
              hint="Le SardocheMètre a besoin du backend pour lire les tweets et les analyses. Lancez-le, puis réessayez."
              onRetry={handleRetry}
            />
          ) : (
            <>
              <section aria-labelledby="hero-title" className="grid items-center gap-10 py-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:gap-14 lg:py-8">
                <div>
                  <SectionLabel>Observatoire satirique · @Sardoche</SectionLabel>
                  <h1 id="hero-title" className="display-title mt-6 text-[clamp(3.4rem,7.6vw,7rem)] text-ink">
                    Il tweete.<br /><span className="text-vermillion">On vérifie.</span>
                  </h1>
                  <p className="mt-7 max-w-xl text-base leading-relaxed text-ink-muted md:text-lg">
                    Le bullshit-o-mètre non officiel qui passe les tweets de Sardoche au crible. Des faits, des scores et un peu de mauvaise foi.
                  </p>
                  <div className="mt-8 flex flex-wrap items-center gap-5">
                    <a href="#archives" className="btn-primary">
                      Voir les analyses<IconArrowRight className="h-4 w-4" />
                    </a>
                    <a href="#methode" className="link-editorial text-ink-muted">Comment ça marche<span aria-hidden="true">↘</span></a>
                  </div>
                </div>

                <section id="barometre" aria-labelledby="score-title" className="surface-card scroll-mt-8 border-vermillion/30 p-6 md:p-8">
                  <div className="flex items-center justify-between gap-4">
                    <h2 id="score-title" className="eyebrow text-ink">Le baromètre</h2>
                    <span className="flex items-center gap-2 rounded-full border border-rule px-3 py-1.5 font-mono text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-verdict-true" />Données réelles
                    </span>
                  </div>
                  <div className="mt-8 flex items-end justify-between gap-4">
                    <p className="font-title text-[clamp(6rem,12vw,9rem)] leading-[0.72] tracking-[-0.09em] tabular-nums text-ink">{Math.round(score)}</p>
                    <div className="mb-1 text-right">
                      <p className="font-mono text-xs text-ink-muted">/100</p>
                      <p className="eyebrow mt-2 text-vermillion">Indice global</p>
                    </div>
                  </div>
                  <ScoreGauge score={score} label={`Indice de bullshit, ${periodLabel}`} className="mt-8" />
                  <div className="mt-7 grid grid-cols-2 gap-4 border-t border-rule pt-5">
                    <div><p className="eyebrow text-ink-muted">Échantillon</p><p className="mt-1.5 font-sans text-sm font-semibold text-ink">{formatNumber(sampleSize)} tweet{sampleSize > 1 ? 's' : ''}</p></div>
                    <div><p className="eyebrow text-ink-muted">Période</p><p className="mt-1.5 font-sans text-sm font-semibold text-ink">{periodLabel}</p></div>
                  </div>
                </section>
              </section>

              <div className="mt-10 flex flex-col gap-4 md:mt-12 lg:flex-row lg:items-center lg:justify-between">
                <PeriodTabs value={period} onChange={handlePeriodChange} />
                <div className="w-full lg:max-w-sm lg:shrink-0">
                  <SearchField value={query} onChange={setQuery} onClear={handleClearSearch} onSubmit={handleSearchSubmit} busy={refreshing && isSearching} />
                </div>
              </div>

              <StatStrip stats={normalizedStats} worstTweet={leadTweet} />

              {isSearching ? (
                tweets.length > 0 ? (
                  renderResults()
                ) : (
                  <div className="mt-12">
                    <EmptyArchive
                      title={`Aucune archive pour « ${debouncedQuery} »`}
                      message={`${periodLabel} ne contient aucun tweet correspondant. ${
                        period === 'all'
                          ? 'Essayez un autre mot-clé.'
                          : 'Essayez un autre mot-clé, ou élargissez la période.'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        className="btn-primary"
                      >
                        Effacer la recherche
                      </button>
                      {period !== 'all' && (
                        <button
                          type="button"
                          onClick={() => handlePeriodChange('all')}
                          className="btn-outline"
                        >
                          Tout l’historique
                        </button>
                      )}
                    </EmptyArchive>
                  </div>
                )
              ) : leadTweet ? (
                <>
                  <section aria-label="Dossier à la une et verdicts" className="mt-16 grid items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.75fr)]">
                    <LeadStory tweet={leadTweet} profile={profile} />
                    <VerdictBreakdown distribution={normalizedStats?.verdictDistribution} totalAnalyzed={normalizedStats?.totalAnalyzed ?? 0} />
                  </section>
                  {renderResults()}
                </>
              ) : (
                <section aria-label="Archives" className="mt-16">
                  {period !== 'all' ? (
                    <EmptyArchive
                      title="Aucune analyse sur cette période."
                      message={`Rien n’a été mesuré ${periodLabel.toLowerCase()}. Les archives sont peut-être plus anciennes : élargissez la période pour retrouver les tweets.`}
                    >
                      <button
                        type="button"
                        onClick={() => handlePeriodChange('all')}
                        className="btn-primary"
                      >
                        Tout l’historique
                      </button>
                    </EmptyArchive>
                  ) : (
                    <EmptyArchive
                      title="Les archives sont encore vides."
                      message="Aucun tweet analysé n’est encore arrivé du backend. Lancez une analyse depuis un tweet, ou revenez après la prochaine collecte."
                    >
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="btn-primary"
                      >
                        Actualiser les archives
                      </button>
                    </EmptyArchive>
                  )}
                </section>
              )}

              <MethodAside score={score} sample={sampleSize} periodLabel={periodLabel} />
            </>
          )}
        </div>
      </main>

      <Footer aiStatus={aiStatus} />
    </div>
  );
}

export default Home;
