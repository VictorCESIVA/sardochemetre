import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as tweetService from '../services/tweetService';
import {
  normalizeFactChecks,
  normalizeScore,
  normalizeTweet,
} from '../lib/tweetUtils';
import { formatNumber, formatTweetDate } from '../lib/format';
import {
  AiStatus,
  ErrorState,
  Footer,
  Loading,
  Masthead,
  ScoreGauge,
  TweetEmbed,
  VerdictBadge,
} from '../components';
import { IconArrowLeft, IconArrowUpRight } from '../components/Icons';

function describeTweetError(error) {
  const status = error?.status ?? error?.response?.status;

  if (error?.code === 'ECONNABORTED') {
    return 'Le backend met trop de temps à répondre. Réessayez dans un instant.';
  }
  if (status) {
    return `Le backend a répondu avec une erreur ${status}. Réessayez dans un instant.`;
  }
  return (
    error?.message ||
    'Une erreur inattendue empêche l’affichage de cette analyse.'
  );
}

function getReasoningText(tweet) {
  if (!tweet?.reasoning) return '';
  if (typeof tweet.reasoning === 'string') return tweet.reasoning;

  try {
    return JSON.stringify(tweet.reasoning, null, 2);
  } catch {
    return String(tweet.reasoning);
  }
}

function Spinner({ className = 'h-3.5 w-3.5' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border border-current border-t-transparent ${className}`}
    />
  );
}

export default function TweetDetail() {
  const { id } = useParams();
  const [tweet, setTweet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiStatusPending, setAiStatusPending] = useState(true);
  const [aiStatusError, setAiStatusError] = useState(null);
  const [profile, setProfile] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAiStatusPending(true);
    setAiStatusError(null);

    tweetService
      .getAIStatus()
      .then((status) => {
        if (!cancelled) setAiStatus(status);
      })
      .catch((statusError) => {
        if (cancelled) return;
        console.error('Statut IA indisponible :', statusError);
        setAiStatus(null);
        setAiStatusError(statusError);
      })
      .finally(() => {
        if (!cancelled) setAiStatusPending(false);
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

    async function loadTweet() {
      setLoading(true);
      setFetchError(null);
      setAnalysisError(null);

      try {
        const loaded = await tweetService.getTweetById(id);
        if (!cancelled) setTweet(loaded);
      } catch (error) {
        if (cancelled) return;
        console.error('Erreur lors du chargement du tweet :', error);
        setTweet(null);
        setFetchError(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTweet();

    return () => {
      cancelled = true;
    };
  }, [id, retryKey]);

  const runAnalysis = useCallback(
    async (target) => {
      if (!target || analyzing) return;

      setAnalyzing(true);
      setAnalysisError(null);

      try {
        const analyzed = await tweetService.analyzeTweet(target);
        setTweet((current) =>
          normalizeTweet({ ...(current || target), ...analyzed }),
        );
      } catch (error) {
        console.error('Erreur pendant l’analyse du tweet :', error);
        setAnalysisError(
          error?.message ||
            'L’analyse IA n’a pas abouti. Le tweet reste consultable et vous pouvez relancer l’analyse.',
        );
      } finally {
        setAnalyzing(false);
      }
    },
    [analyzing],
  );

  const isNotFound =
    Boolean(fetchError) &&
    (fetchError?.status === 404 ||
      fetchError?.response?.status === 404 ||
      /not found|introuvable|n['’]existe pas/i.test(fetchError?.message || ''));

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Masthead compact aiStatus={aiStatus} />
        <main id="main-content" className="flex-1">
          <div className="container-editorial py-10 md:py-14">
            <Loading message="Chargement de l’analyse…" rows={4} />
          </div>
        </main>
        <Footer aiStatus={aiStatus} />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex min-h-screen flex-col">
        <Masthead compact aiStatus={aiStatus} />
        <main id="main-content" className="flex-1">
          <div className="container-editorial py-10 md:py-14">
            <ErrorState
              title={
                isNotFound
                  ? 'Tweet introuvable'
                  : 'Impossible de charger cette analyse'
              }
              message={
                isNotFound
                  ? `Le tweet #${id} n’existe pas ou n’est plus disponible dans les archives.`
                  : describeTweetError(fetchError)
              }
              hint={
                isNotFound
                  ? 'Vérifiez le lien, ou revenez aux archives pour explorer les autres analyses.'
                  : 'Vérifiez que le backend est démarré, puis réessayez.'
              }
              onRetry={() => setRetryKey((key) => key + 1)}
              showBackendLink={!isNotFound}
              homeLink
            />
          </div>
        </main>
        <Footer aiStatus={aiStatus} />
      </div>
    );
  }

  if (!tweet) {
    return (
      <div className="flex min-h-screen flex-col">
        <Masthead compact aiStatus={aiStatus} />
        <main id="main-content" className="flex-1">
          <div className="container-editorial py-10 md:py-14">
            <ErrorState
              title="Tweet introuvable"
              message={`Le tweet #${id} n’existe pas ou n’est plus disponible.`}
              hint="Vérifiez le lien, ou revenez aux archives pour explorer les autres analyses."
              showBackendLink={false}
              homeLink
            />
          </div>
        </main>
        <Footer aiStatus={aiStatus} />
      </div>
    );
  }

  const rawScore = Number(tweet.bullshit_score);
  const hasAnalysis =
    tweet.bullshit_score !== null &&
    tweet.bullshit_score !== undefined &&
    Number.isFinite(rawScore);
  const score = hasAnalysis ? Math.round(normalizeScore(rawScore, 0)) : null;
  const verdictLabel =
    tweet.verdict || (hasAnalysis ? 'NON CLASSÉ' : 'NON ANALYSÉ');
  const factChecks = normalizeFactChecks(tweet.fact_checks);
  const reasoningText = getReasoningText(tweet);
  const humor = tweet.humor_comment?.trim();

  const aiConfigured = aiStatus?.configured === true;
  const aiUnavailable = aiStatus?.configured === false;

  const shareUrl =
    hasAnalysis && typeof window !== 'undefined'
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          `Le SardocheMètre a détecté ${verdictLabel} (${score}/100) sur un tweet de Sardoche.`,
        )}&url=${encodeURIComponent(window.location.href)}`
      : null;

  const aiNote = aiStatusPending
    ? 'Vérification du statut IA…'
    : aiUnavailable
      ? 'Analyse IA non configurée : ajoutez OPENCODE_API_KEY dans backend/.env, puis redémarrez le backend.'
      : aiStatusError
        ? 'Statut IA indisponible : vérifiez que le backend est démarré.'
        : null;

  return (
    <div className="flex min-h-screen flex-col">
      <Masthead compact aiStatus={aiStatus} />

      <main id="main-content" className="flex-1">
        <article className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-12">
          <Link to="/" className="link-editorial text-ink">
            <IconArrowLeft className="h-3.5 w-3.5" />
            Retour aux archives
          </Link>

          <header className="mt-8 md:mt-10">
            <h1 className="eyebrow text-vermillion">
              Analyse · Tweet #{tweet.id}
            </h1>
          </header>

          <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(18.5rem,0.6fr)] lg:gap-10">
            <TweetEmbed tweet={tweet} profile={profile} variant="full" />

            <aside
              aria-labelledby="score-title"
              className="flex flex-col rounded-[14px] border border-embed-rule bg-embed p-5 lg:sticky lg:top-8 lg:self-start"
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-rule pb-2">
                <h2 id="score-title" className="eyebrow text-ink-muted">
                  Indice de bullshit
                </h2>
              </div>

              {hasAnalysis ? (
                <div className="mt-4 flex items-end gap-2">
                  <p className="font-title text-[clamp(4.75rem,7vw,6.5rem)] leading-[0.68] tracking-[-0.07em] tabular-nums text-ink">
                    {score}
                  </p>
                  <p className="mb-2 font-mono text-xs text-ink-muted">/100</p>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="font-title text-[4.75rem] leading-none text-ink-muted">
                    —
                  </p>
                  <p className="mt-1 font-title text-xl leading-tight italic text-ink">
                    Analyse en attente
                  </p>
                </div>
              )}

              <ScoreGauge
                score={hasAnalysis ? score : 0}
                label={`Indice de bullshit du tweet ${tweet.id}`}
                className="mt-5"
              />

              <div className="mt-5">
                <VerdictBadge verdict={verdictLabel} size="lg" />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-ink-muted">
                {hasAnalysis
                  ? 'La note et le verdict sont produits par l’IA éditoriale, puis conservés avec le tweet.'
                  : 'Ce tweet n’a pas encore été passé au crible. Lancez une analyse pour lui donner un score.'}
              </p>

              <div className="mt-5 border-t border-rule pt-4">
                <AiStatus status={aiStatus} />

                {aiConfigured && (
                  <button
                    type="button"
                    onClick={() => runAnalysis(tweet)}
                    disabled={analyzing}
                    className="btn-outline mt-3 w-full"
                  >
                    {analyzing ? (
                      <>
                        <Spinner />
                        Analyse en cours…
                      </>
                    ) : hasAnalysis ? (
                      'Réanalyser avec DeepSeek'
                    ) : (
                      'Analyser avec DeepSeek'
                    )}
                  </button>
                )}

                {aiNote && (
                  <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                    {aiNote}
                  </p>
                )}
              </div>

              {tweet.analyzed_at && (
                <p className="mt-auto border-t border-rule pt-3 font-mono text-[9px] tracking-[0.1em] text-ink-muted uppercase">
                  Mis à jour le {formatTweetDate(tweet.analyzed_at)}
                </p>
              )}
            </aside>
          </div>

          {analyzing && (
            <div
              role="status"
              aria-live="polite"
              className="mt-6 flex items-start gap-3 border-l-2 border-vermillion py-2 pl-4"
            >
              <Spinner className="mt-1 h-4 w-4 text-vermillion" />
              <div>
                <p className="eyebrow text-vermillion">
                  Analyse en cours…
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  DeepSeek V4.1 Flash vérifie les affirmations. Cela peut
                  prendre quelques secondes.
                </p>
              </div>
            </div>
          )}

          {analysisError && (
            <div
              role="alert"
              className="mt-6 border border-vermillion/40 bg-vermillion-wash p-4 md:p-5"
            >
              <p className="eyebrow text-vermillion">Analyse interrompue</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">
                {analysisError}
              </p>
              <button
                type="button"
                onClick={() => runAnalysis(tweet)}
                disabled={analyzing}
                className="btn-outline mt-4"
              >
                Relancer
              </button>
            </div>
          )}

          {reasoningText && (
            <section aria-labelledby="analysis-title" className="mt-12">
              <div className="border-b border-ink pb-2">
                <h2
                  id="analysis-title"
                  className="font-title text-2xl leading-tight tracking-[-0.03em] text-ink md:text-3xl"
                >
                  L’analyse
                </h2>
              </div>
              <div className="mt-6 max-w-3xl border-l-2 border-vermillion pl-5 md:pl-6">
                <p className="whitespace-pre-wrap text-[16px] leading-[1.8] break-words text-ink md:text-[17px]">
                  {reasoningText}
                </p>
              </div>
            </section>
          )}

          {factChecks.length > 0 && (
            <section aria-labelledby="fact-checks-title" className="mt-12">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink pb-2">
                <h2
                  id="fact-checks-title"
                  className="font-title text-2xl leading-tight tracking-[-0.03em] text-ink md:text-3xl"
                >
                  Vérification des faits
                </h2>
                <span className="eyebrow text-ink-muted">
                  {formatNumber(factChecks.length)} affirmation
                  {factChecks.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="hidden md:block">
                <table className="w-full text-left">
                  <caption className="sr-only">
                    Affirmations vérifiées, verdicts et notes
                  </caption>
                  <thead>
                    <tr className="border-b border-rule">
                      <th
                        scope="col"
                        className="eyebrow py-3 pr-6 font-normal text-ink-muted"
                      >
                        Affirmation
                      </th>
                      <th
                        scope="col"
                        className="eyebrow w-44 py-3 pr-6 font-normal text-ink-muted"
                      >
                        Verdict
                      </th>
                      <th
                        scope="col"
                        className="eyebrow py-3 font-normal text-ink-muted"
                      >
                        Note
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {factChecks.map((check, index) => (
                      <tr
                        key={`${index}-${check.claim}`}
                        className="border-b border-rule align-top"
                      >
                        <td className="py-4 pr-6 text-sm leading-relaxed break-words text-ink">
                          {check.claim || 'Affirmation non précisée'}
                        </td>
                        <td className="py-4 pr-6">
                          <VerdictBadge
                            verdict={check.verdict || 'invérifiable'}
                            size="sm"
                          />
                        </td>
                        <td className="py-4 text-sm leading-relaxed break-words text-ink-muted">
                          {check.note || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-b border-rule md:hidden">
                {factChecks.map((check, index) => (
                  <div
                    key={`${index}-${check.claim}`}
                    className="border-b border-rule py-4 last:border-b-0"
                  >
                    <p className="text-sm leading-relaxed break-words text-ink">
                      {check.claim || 'Affirmation non précisée'}
                    </p>
                    <div className="mt-3">
                      <VerdictBadge
                        verdict={check.verdict || 'invérifiable'}
                        size="sm"
                      />
                    </div>
                    {check.note && (
                      <p className="mt-2 text-xs leading-relaxed break-words text-ink-muted">
                        {check.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {humor && (
            <section aria-labelledby="humor-title" className="mt-12">
              <div className="border-y border-ink py-10 text-center md:py-14">
                <h2 id="humor-title" className="eyebrow text-ink-muted">
                  Le mot de la fin
                </h2>
                <blockquote className="mx-auto mt-5 max-w-3xl font-title text-[clamp(1.5rem,3.4vw,2.75rem)] leading-[1.2] tracking-[-0.02em] break-words italic text-ink">
                  <span aria-hidden="true" className="text-vermillion">
                    «{' '}
                  </span>
                  {humor}
                  <span aria-hidden="true" className="text-vermillion">
                    {' '}
                    »
                  </span>
                </blockquote>
              </div>
            </section>
          )}

          {shareUrl && (
            <section
              aria-labelledby="share-title"
              className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-5"
            >
              <h2 id="share-title" className="eyebrow text-ink-muted">
                Partager cette analyse
              </h2>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link-editorial text-ink"
              >
                Partager sur X
                <IconArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </section>
          )}
        </article>
      </main>

      <Footer aiStatus={aiStatus} />
    </div>
  );
}
