'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const DB_PATH = path.join(
  os.tmpdir(),
  `sardochemetre-sources-${process.pid}-${Date.now()}.db`
);

process.env.SQLITE_PATH = DB_PATH;
process.env.DB_CLIENT = 'sqlite';
process.env.DEMO_MODE = 'true';
process.env.TWITTER_SOURCE = 'mock';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = '*';
delete process.env.OPENCODE_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_PROVIDER;

const createApp = require('../app');
const repo = require('../db/sqlite');
const sourcesService = require('../services/sourcesService');
const aiService = require('../services/aiService');
const {
  normalizeAnalysis,
  normalizeFactChecks,
} = require('../services/claudeService');
const { buildAnalysisPrompt } = require('../services/tweetContext');

let server;
let base;

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${base}${url}`, { ...options, headers });
  const text = await response.text();

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

function startServer(handler) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(handler);
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      resolve({
        server: srv,
        baseUrl: `http://127.0.0.1:${srv.address().port}`,
      });
    });
  });
}

function closeServer(srv) {
  return new Promise((resolve) => {
    srv.close(resolve);
    if (typeof srv.closeIdleConnections === 'function') {
      srv.closeIdleConnections();
    }
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
  });
}

before(async () => {
  const app = createApp();
  server = app.listen(0, '127.0.0.1');

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }
    });
  }

  repo.closeDatabase();

  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${DB_PATH}${suffix}`);
    } catch {
      // fichier déjà absent
    }
  }
});

test('cleanQuery : URLs, hashtags, guillemets et longueur', () => {
  assert.equal(
    sourcesService.cleanQuery('Le déficit http://x.com/abc explose #Macron !'),
    'Le déficit explose !'
  );
  assert.equal(sourcesService.cleanQuery('   '), '');
  assert.equal(
    sourcesService.cleanQuery('x'.repeat(200)).length,
    sourcesService.MAX_QUERY_CHARS
  );
});

test('buildQueries : affirmations puis mentions, dédupliquées et plafonnées', () => {
  const queries = sourcesService.buildQueries(
    {
      fact_checks: [
        { claim: 'Le déficit public atteint 42,5 %' },
        { claim: 'le déficit public atteint 42,5 % ' },
        { claim: 'https://exemple.fr' },
      ],
      mentions: [{ label: 'David Lisnard' }, { label: 'David Lisnard' }],
    },
    { quoted_tweet: { content: 'Éric Zemmour confirme la primaire' } }
  );

  assert.ok(queries.includes('Le déficit public atteint 42,5 %'));
  assert.ok(queries.includes('David Lisnard'));
  assert.ok(queries.length <= sourcesService.MAX_QUERIES);
  assert.ok(!queries.some((query) => query.length < 4));
  assert.ok(
    queries.every((query, index) => queries.indexOf(query) === index),
    'pas de doublon'
  );
});

test('normalizeSources : URL invalide rejetée, doublons ignorés, JSON toléré', () => {
  const sources = sourcesService.normalizeSources([
    { title: 'Wikipédia', url: 'https://fr.wikipedia.org/wiki/Sardoche', snippet: 'Extrait' },
    { title: 'Doublon', url: 'https://fr.wikipedia.org/wiki/Sardoche' },
    { title: 'Pas http', url: 'ftp://exemple.fr' },
    { title: 'Vide', url: '' },
    null,
  ]);

  assert.deepEqual(sources, [
    {
      title: 'Wikipédia',
      url: 'https://fr.wikipedia.org/wiki/Sardoche',
      snippet: 'Extrait',
      provider: '',
    },
  ]);

  const fromJson = sourcesService.normalizeSources(
    JSON.stringify([
      { title: 'Tavily', url: 'https://exemple.fr/a', provider: 'tavily' },
    ])
  );
  assert.equal(fromJson.length, 1);
  assert.equal(fromJson[0].provider, 'tavily');

  assert.deepEqual(sourcesService.normalizeSources('pas du json'), []);
  assert.deepEqual(sourcesService.normalizeSources(null), []);
});

test('formatSourcesBlock : bloc numéroté avec extrait, vide sinon', () => {
  const block = sourcesService.formatSourcesBlock([
    { title: 'Retraites', url: 'https://fr.wikipedia.org/wiki/Retraite', snippet: 'Extrait court' },
  ]);

  assert.match(block, /Sources consultées/);
  assert.match(block, /\[1\]/);
  assert.match(block, /fr\.wikipedia\.org\/wiki\/Retraite/);
  assert.match(block, /« Extrait court »/);
  assert.equal(sourcesService.formatSourcesBlock([]), '');
  assert.equal(sourcesService.formatSourcesBlock(null), '');
});

test('searchWikipedia : extrait nettoyé du HTML, URL construite', async () => {
  const { server: wiki, baseUrl } = await startServer((req, res) => {
    assert.equal(req.url.startsWith('/w/api.php'), true);
    assert.match(req.url, /srsearch=Retraites/);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        query: {
          search: [
            {
              title: 'Retraite en France',
              snippet:
                'Le <span class="searchmatch">système</span> par répartition…',
            },
          ],
        },
      })
    );
  });

  try {
    const results = await sourcesService.searchWikipedia('Retraites', {
      env: { WIKIPEDIA_API_URL: `${baseUrl}/w/api.php` },
    });

    assert.deepEqual(results, [
      {
        title: 'Retraite en France',
        url: 'https://fr.wikipedia.org/wiki/Retraite_en_France',
        snippet: 'Le système par répartition…',
        provider: 'wikipedia',
      },
    ]);
  } finally {
    await closeServer(wiki);
  }
});

test('searchWikipedia : réponse incohérente renvoie []', async () => {
  const { server: wiki, baseUrl } = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ query: null }));
  });

  try {
    const results = await sourcesService.searchWikipedia('peu importe', {
      env: { WIKIPEDIA_API_URL: `${baseUrl}/w/api.php` },
    });
    assert.deepEqual(results, []);
  } finally {
    await closeServer(wiki);
  }
});

test('searchTavily : clé absente → [], clé présente → résultats normalisés', async () => {
  assert.deepEqual(
    await sourcesService.searchTavily('requête', { env: {} }),
    []
  );

  let payload = null;
  const { server: tavily, baseUrl } = await startServer(async (req, res) => {
    payload = JSON.parse(await readBody(req));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        results: [
          { title: 'Article', url: 'https://exemple.fr/article', content: 'Contenu' },
        ],
      })
    );
  });

  try {
    const results = await sourcesService.searchTavily('requête', {
      env: {
        TAVILY_API_KEY: 'tvly-test',
        TAVILY_API_URL: baseUrl,
      },
    });

    assert.equal(payload.api_key, 'tvly-test');
    assert.equal(payload.query, 'requête');
    assert.deepEqual(results, [
      {
        title: 'Article',
        url: 'https://exemple.fr/article',
        snippet: 'Contenu',
        provider: 'tavily',
      },
    ]);
  } finally {
    await closeServer(tavily);
  }
});

test('gatherSources : fusion, dédoublonnage, tolérance aux pannes et plafond', async () => {
  const ok = async () => [
    {
      title: 'Source A',
      url: 'https://exemple.fr/a',
      snippet: 'a',
      provider: 'wikipedia',
    },
  ];
  const boom = async () => {
    throw new Error('réseau coupé');
  };
  const duplicate = async () => [
    {
      title: 'Source A (bis)',
      url: 'https://exemple.fr/a',
      snippet: 'a',
      provider: 'wikipedia',
    },
    {
      title: 'Source B',
      url: 'https://exemple.fr/b',
      snippet: 'b',
      provider: 'tavily',
    },
  ];

  const analysis = {
    fact_checks: [{ claim: 'Le déficit public atteint 42,5 %' }],
    mentions: [{ label: 'David Lisnard' }],
  };

  const sources = await sourcesService.gatherSources(analysis, null, {
    env: {},
    searchers: [ok, boom, duplicate],
  });

  assert.equal(sources.length, 2, 'les doublons par URL sont ignorés');
  assert.ok(sources.some((source) => source.url === 'https://exemple.fr/a'));
  assert.ok(sources.some((source) => source.url === 'https://exemple.fr/b'));
  assert.ok(sources.every((source) => typeof source.query === 'string'));
});

test('normalizeFactChecks : les sources du modèle sont filtrées sur les URL autorisées', () => {
  const allowed = ['https://fr.wikipedia.org/wiki/Retraite'];

  const checks = normalizeFactChecks(
    [
      {
        claim: 'Les retraites pèsent 42,5 % du déficit',
        verdict: 'discutable',
        note: 'Ordre de grandeur débattu.',
        sources: [
          { title: 'Retraite', url: 'https://fr.wikipedia.org/wiki/Retraite' },
          { title: 'Inventée', url: 'https://source-inventee.fr/x' },
          { title: 'Doublon', url: 'https://fr.wikipedia.org/wiki/Retraite' },
          { title: 'Pas http', url: 'javascript:alert(1)' },
        ],
      },
    ],
    { allowedUrls: allowed }
  );

  assert.deepEqual(checks[0].sources, [
    { title: 'Retraite', url: 'https://fr.wikipedia.org/wiki/Retraite' },
  ]);
});

test('normalizeAnalysis : allowedUrls filtre aussi depuis le haut niveau', () => {
  const analysis = normalizeAnalysis(
    {
      bullshit_score: 30,
      verdict: 'DOUTEUX',
      reasoning: 'ok',
      fact_checks: [
        {
          claim: 'Affirmation',
          verdict: 'discutable',
          sources: [{ title: 'Ok', url: 'https://ok.fr/a' }],
        },
      ],
    },
    { allowedUrls: ['https://ok.fr/a'] }
  );

  assert.equal(analysis.fact_checks[0].sources.length, 1);

  const filtered = normalizeAnalysis(
    {
      bullshit_score: 30,
      verdict: 'DOUTEUX',
      reasoning: 'ok',
      fact_checks: [
        {
          claim: 'Affirmation',
          verdict: 'discutable',
          sources: [{ title: 'Hors liste', url: 'https://hors-liste.fr/a' }],
        },
      ],
    },
    { allowedUrls: ['https://ok.fr/a'] }
  );

  assert.deepEqual(filtered.fact_checks[0].sources, []);
});

test('buildAnalysisPrompt : le bloc sources accompagne le tweet', () => {
  const prompt = buildAnalysisPrompt('Le déficit explose.', null, {
    sources: [
      {
        title: 'Déficit public',
        url: 'https://fr.wikipedia.org/wiki/Dette_publique',
        snippet: 'Extrait',
      },
    ],
  });

  assert.match(prompt, /Le déficit explose\./);
  assert.match(prompt, /Sources consultées/);
  assert.match(prompt, /fr\.wikipedia\.org\/wiki\/Dette_publique/);

  const sans = buildAnalysisPrompt('Tweet seul.', null, {});
  assert.ok(!sans.includes('Sources consultées'));
});

test('analyzeWithSources : deuxième passe avec sources, repli sur la première', async () => {
  const calls = [];
  const SOURCES = [
    {
      title: 'Déficit',
      url: 'https://fr.wikipedia.org/wiki/Dette_publique',
      snippet: 'Extrait',
      provider: 'wikipedia',
    },
  ];

  const runPass = async (content, options) => {
    calls.push({ content, sources: options.sources || [] });

    if (calls.length === 1) {
      return {
        bullshit_score: 40,
        verdict: 'DOUTEUX',
        reasoning: 'Première passe.',
        fact_checks: [{ claim: 'Le déficit explose', verdict: 'discutable', note: '', sources: [] }],
        political: false,
        mentions: [],
        humor_comment: 'punch',
      };
    }

    return {
      bullshit_score: 45,
      verdict: 'DOUTEUX',
      reasoning: 'Deuxième passe sourcée.',
      fact_checks: [
        {
          claim: 'Le déficit explose',
          verdict: 'discutable',
          note: 'Source consultée.',
          sources: [
            { title: 'Déficit', url: 'https://fr.wikipedia.org/wiki/Dette_publique' },
          ],
        },
      ],
      political: false,
      mentions: [],
      humor_comment: 'punch sourcée',
    };
  };

  const gather = async () => SOURCES;

  const analysis = await aiService.analyzeWithSources(runPass, 'Le déficit explose.', {
    env: { ANALYZE_WITH_SOURCES: 'true' },
    gatherSources: gather,
  });

  assert.equal(calls.length, 2, 'deux passes exécutées');
  assert.deepEqual(calls[1].sources, SOURCES, 'la passe 2 reçoit les sources');
  assert.equal(analysis.reasoning, 'Deuxième passe sourcée.');
  assert.equal(analysis.fact_checks[0].sources.length, 1);
  assert.equal(analysis.sources.length, 1, 'les sources consultées sont attachées');
  assert.equal(analysis.sources[0].provider, 'wikipedia');
});

test('analyzeWithSources : pas de sources trouvées → première passe conservée', async () => {
  const calls = [];
  const runPass = async () => {
    calls.push(1);
    return {
      bullshit_score: 40,
      verdict: 'DOUTEUX',
      reasoning: 'Première passe.',
      fact_checks: [],
      political: false,
      mentions: [],
      humor_comment: 'punch',
    };
  };

  const analysis = await aiService.analyzeWithSources(runPass, 'tweet', {
    env: {},
    gatherSources: async () => [],
  });

  assert.equal(calls.length, 1);
  assert.equal(analysis.reasoning, 'Première passe.');
  assert.ok(!analysis.sources);
});

test('analyzeWithSources : ANALYZE_WITH_SOURCES=false désactive la recherche', async () => {
  const calls = [];
  const runPass = async () => {
    calls.push(1);
    return {
      bullshit_score: 40,
      verdict: 'DOUTEUX',
      reasoning: 'Mono-passe.',
      fact_checks: [],
      political: false,
      mentions: [],
      humor_comment: 'punch',
    };
  };

  let gathered = false;
  const analysis = await aiService.analyzeWithSources(runPass, 'tweet', {
    env: { ANALYZE_WITH_SOURCES: 'false' },
    gatherSources: async () => {
      gathered = true;
      return [];
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(gathered, false);
  assert.equal(analysis.reasoning, 'Mono-passe.');
});

test('analyzeWithSources : deuxième passe en échec → première passe conservée', async () => {
  let calls = 0;
  const runPass = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        bullshit_score: 40,
        verdict: 'DOUTEUX',
        reasoning: 'Première passe.',
        fact_checks: [],
        political: false,
        mentions: [],
        humor_comment: 'punch',
      };
    }
    return null;
  };

  const analysis = await aiService.analyzeWithSources(runPass, 'tweet', {
    env: {},
    gatherSources: async () => [
      { title: 'S', url: 'https://exemple.fr/s', snippet: '', provider: 'wikipedia' },
    ],
  });

  assert.equal(calls, 3, 'une passe 2 et une tentative de rattrapage');
  assert.equal(analysis.reasoning, 'Première passe.');
  assert.ok(!analysis.sources);
});

test('analyzeWithSources : le rattrapage à température réduite sauve la passe 2', async () => {
  let calls = 0;
  const runPass = async (content, options = {}) => {
    calls += 1;
    if (calls === 1) {
      return {
        bullshit_score: 40,
        verdict: 'DOUTEUX',
        reasoning: 'Première passe.',
        fact_checks: [{ claim: 'Le déficit explose', verdict: 'discutable', note: '', sources: [] }],
        political: false,
        mentions: [],
        humor_comment: 'punch',
      };
    }

    if (calls === 2) return null;

    assert.equal(options.temperature, 0.2, 'le rattrapage baisse la température');

    return {
      bullshit_score: 45,
      verdict: 'DOUTEUX',
      reasoning: 'Deuxième passe au rattrapage.',
      fact_checks: [
        {
          claim: 'Le déficit explose',
          verdict: 'discutable',
          note: 'Source consultée.',
          sources: [{ title: 'S', url: 'https://exemple.fr/s' }],
        },
      ],
      political: false,
      mentions: [],
      humor_comment: 'punch sourcée',
    };
  };

  const analysis = await aiService.analyzeWithSources(runPass, 'Le déficit explose.', {
    env: {},
    gatherSources: async () => [
      { title: 'S', url: 'https://exemple.fr/s', snippet: '', provider: 'wikipedia' },
    ],
  });

  assert.equal(calls, 3);
  assert.equal(analysis.reasoning, 'Deuxième passe au rattrapage.');
  assert.equal(analysis.sources.length, 1);
});

test('API : GET /api/tweets/historique agrège par jour, semaine et mois', async () => {
  const day = await request('/api/tweets/historique?period=all&bucket=day');
  assert.equal(day.status, 200);
  assert.equal(day.body.bucket, 'day');
  assert.equal(day.body.period, 'all');
  assert.ok(day.body.points.length >= 8, '8 jours de démo');
  assert.ok(!Number.isNaN(Date.parse(day.body.updatedAt)));

  for (const point of day.body.points) {
    assert.match(point.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(point.avgScore));
    assert.ok(Number.isFinite(point.count));
    assert.ok(Number.isFinite(point.politicalCount));
    assert.ok(point.avgPoliticalScore === null || Number.isFinite(point.avgPoliticalScore));
  }

  const week = await request('/api/tweets/historique?period=all&bucket=week');
  assert.equal(week.status, 200);
  assert.ok(week.body.points.length >= 1);
  assert.ok(week.body.points.length < day.body.points.length);

  const month = await request('/api/tweets/historique?period=all&bucket=month');
  assert.equal(month.status, 200);
  assert.equal(month.body.points.length, 1);

  const dates = week.body.points.map((point) => point.date);
  assert.deepEqual(dates, [...dates].sort(), 'les points sont triés');
});

test('API : bucket ou période invalide refusés', async () => {
  const bucket = await request('/api/tweets/historique?bucket=annee');
  assert.equal(bucket.status, 400);
  assert.match(bucket.body.error, /Invalid bucket/);

  const period = await request('/api/tweets/historique?period=siecle');
  assert.equal(period.status, 400);
  assert.match(period.body.error, /Invalid period/);
});

test('API : les analyses persistées exposent leurs sources', async () => {
  repo.saveTweet({
    id: 'sources-1',
    content: 'Le déficit public explose à cause des retraites.',
    posted_at: new Date().toISOString(),
    source: 'mock',
  });

  repo.upsertAnalysis('sources-1', {
    bullshit_score: 30,
    verdict: 'DOUTEUX',
    reasoning: 'Ordre de grandeur débattu.',
    fact_checks: [
      {
        claim: 'Le déficit explose',
        verdict: 'discutable',
        note: 'Chiffres à vérifier.',
        sources: [{ title: 'Retraite', url: 'https://fr.wikipedia.org/wiki/Retraite' }],
      },
    ],
    sources: [
      {
        title: 'Retraite en France',
        url: 'https://fr.wikipedia.org/wiki/Retraite',
        snippet: 'Extrait',
        provider: 'wikipedia',
      },
    ],
    humor_comment: 'punch',
    analyzed_at: new Date().toISOString(),
  });

  const { status, body } = await request('/api/tweets/sources-1');
  assert.equal(status, 200);

  assert.equal(body.tweet.sources.length, 1);
  assert.equal(body.tweet.sources[0].provider, 'wikipedia');
  assert.equal(body.tweet.fact_checks[0].sources.length, 1);
  assert.equal(
    body.tweet.fact_checks[0].sources[0].url,
    'https://fr.wikipedia.org/wiki/Retraite'
  );

  const listed = await request('/api/tweets?limit=100');
  const mine = listed.body.tweets.find((tweet) => tweet.id === 'sources-1');
  assert.ok(mine, 'le tweet sourcé apparaît dans la liste');
  assert.equal(mine.sources.length, 1);
});
