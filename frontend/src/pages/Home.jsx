import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
  TweetEmbed,
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

function MethodAside({ score, sample, periodLabel, latestTweet, profile }) {
  return (
    <aside
      id="methode"
      className="scroll-mt-8 border-t border-ink pt-6 lg:border-t-0 lg:border-l lg:border-rule lg:pt-1 lg:pl-8"
    >
      <SectionLabel as="h2">La méthode</SectionLabel>

      <p className="mt-4 text-sm leading-relaxed text-ink-muted">
        Chaque tweet est lu, recoupé, puis noté de 0 à 100. Les affirmations
        vérifiables sont isolées, confrontées aux faits connus, et le verdict
        tombe. Le doute reste autorisé.
      </p>

      <dl className="mt-6 border-t border-rule pt-4">
        <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2.5">
          <dt className="eyebrow text-ink-muted">Score global</dt>
          <dd className="font-mono text-xs tabular-nums text-ink">
            {Math.round(score)}/100
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-b border-rule py-2.5">
          <dt className="eyebrow text-ink-muted">Échantillon</dt>
          <dd className="font-mono text-xs tabular-nums text-ink">
            {formatNumber(sample)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2.5">
          <dt className="eyebrow text-ink-muted">Période</dt>
          <dd className="font-mono text-[10px] text-ink">{periodLabel}</dd>
        </div>
      </dl>

      {latestTweet && (
        <div className="mt-6 border-t border-rule pt-4">
          <p className="eyebrow text-ink-muted">Dernière entrée</p>
          <div className="mt-3">
            <TweetEmbed
              tweet={latestTweet}
              profile={profile}
              variant="compact"
              showMedia={false}
              showQuoted={false}
            />
          </div>
          <Link
            to={`/tweet/${encodeURIComponent(String(latestTweet.id))}`}
            className="link-editorial group mt-3 text-ink"
          >
            Lire l’analyse
            <IconArrowRight className="h-3 w-3 transition-transform duration-150 group-hover:translate-x-1" />
          </Link>
        </div>
      )}
    </aside>
  );
}

function EmptyArchive({ title, message, children }) {
  return (
    <div className="border-y border-ink py-10 md:py-14">
      <p className="eyebrow text-vermillion">Archives</p>
      <h2 className="mt-3 max-w-2xl font-title text-3xl leading-[1.05] tracking-[-0.035em] text-ink md:text-4xl">
        {title}
      </h2>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">
        {message}
      </p>
      {children && (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          {children}
        </div>
      )}
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

  const latestTweet = tweets[0] || null;
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
    <section id="archives" className="mt-12 scroll-mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink pb-2">
        <h2 className="font-title text-2xl leading-tight tracking-[-0.03em] text-ink md:text-3xl">
          {isSearching ? 'Résultats de recherche' : 'Les dernières analyses'}
        </h2>
        <p
          role="status"
          aria-live="polite"
          className="eyebrow text-ink-muted"
        >
          {isSearching
            ? `${formatNumber(totalResults)} résultat${totalResults > 1 ? 's' : ''} pour « ${debouncedQuery} »`
            : `${formatNumber(totalResults)} tweet${totalResults > 1 ? 's' : ''} · ${periodLabel}`}
        </p>
      </div>

      <div
        className={`mt-1 transition-opacity ${refreshing ? 'opacity-60' : 'opacity-100'}`}
      >
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

  const methodAside = (
    <MethodAside
      score={score}
      sample={sampleSize}
      periodLabel={periodLabel}
      latestTweet={latestTweet}
      profile={profile}
    />
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
              <section aria-labelledby="hero-title">
                <SectionLabel>Données réelles · @Sardoche</SectionLabel>
                <h1
                  id="hero-title"
                  className="mt-3 max-w-4xl font-title text-[clamp(3rem,8vw,6.5rem)] leading-[0.9] tracking-[-0.055em] text-balance text-ink"
                >
                  Le bullshit,{' '}
                  <span className="font-normal italic">mesuré</span>
                  <span className="text-vermillion">.</span>
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted md:text-base">
                  Sardoche tweete. Une IA vérifie. La nuance, elle, prend des
                  vacances.
                </p>
              </section>

              <div className="mt-8 flex flex-col gap-5 border-y border-rule py-3.5 md:mt-10 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
                <PeriodTabs value={period} onChange={handlePeriodChange} />
                <div className="w-full lg:max-w-sm lg:shrink-0">
                  <SearchField
                    value={query}
                    onChange={setQuery}
                    onClear={handleClearSearch}
                    onSubmit={handleSearchSubmit}
                    busy={refreshing && isSearching}
                  />
                </div>
              </div>

              <section
                aria-labelledby="score-title"
                className="mt-10 grid gap-10 md:mt-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12"
              >
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
                    <h2 id="score-title" className="eyebrow text-ink-muted">
                      Indice de bullshit
                    </h2>
                    <span className="eyebrow text-ink-muted">
                      {periodLabel}
                    </span>
                  </div>

                  <div className="mt-4 flex items-end gap-3">
                    <p className="font-title text-[clamp(6rem,17vw,12rem)] leading-[0.68] tracking-[-0.075em] tabular-nums text-ink">
                      {Math.round(score)}
                    </p>
                    <p className="mb-4 font-mono text-xs text-ink-muted">/100</p>
                  </div>

                  <ScoreGauge
                    score={score}
                    label={`Indice de bullshit, ${periodLabel}`}
                    className="mt-7"
                  />

                  <p className="mt-4 font-mono text-[10px] leading-relaxed tracking-[0.1em] text-ink-muted uppercase">
                    Échantillon · {formatNumber(sampleSize)} tweet
                    {sampleSize > 1 ? 's' : ''} analysé
                    {sampleSize > 1 ? 's' : ''} · {periodLabel}
                  </p>
                </div>

                <VerdictBreakdown
                  distribution={normalizedStats?.verdictDistribution}
                  totalAnalyzed={normalizedStats?.totalAnalyzed ?? 0}
                />
              </section>

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
                  <section
                    aria-label="À la une et méthode"
                    className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-12"
                  >
                    <LeadStory tweet={leadTweet} profile={profile} />
                    {methodAside}
                  </section>

                  {renderResults()}
                </>
              ) : (
                <section
                  aria-label="Archives et méthode"
                  className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-12"
                >
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
                  {methodAside}
                </section>
              )}
            </>
          )}
        </div>
      </main>

      <Footer aiStatus={aiStatus} />
    </div>
  );
}

export default Home;
