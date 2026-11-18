'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DB_PATH = path.join(
  os.tmpdir(),
  `sardochemetre-politics-${process.pid}-${Date.now()}.db`
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
const politics = require('../services/politicsService');
const { generateMockAnalysis } = require('../services/claudeService');

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

test('isPoliticalContent : vraies formules de tweets de campagne détectées', () => {
  const political = [
    'Vous êtes enfermés dans votre petite bulle mais le nombre d’entrepreneurs qui ont déjà préparé leurs valises à la vue du second tour Mélenchon - LePen est effrayant.',
    'Il vous faut juste UN débat pour voir à quel point Lisnard va humilier ces socialistes.',
    'Le nouveau chiffre à ressortir partout pour les retraites c’est donc 42,5% du déficit public.',
    'Mélenchon commence sa propagande anti-Lisnard, il sent le monstre s’approcher.',
    'David Lisnard confirme qu’il souhaite une primaire avec Éric Zemmour.',
    'L’amendement passe à 292 voix pour et 51 contre avec une assemblée majoritairement à gauche.',
    'Toute l’Espagne manifeste pour une crise de logement entraînée par un plafonnement des loyers.',
    'Ces élections 2027, j’ai l’impression d’être sur un iddle game.',
    'La CSG sur les revenus d’activité, il faut la baisser pour cotiser moins.',
    'On est en pleine campagne présidentielle.',
  ];

  for (const content of political) {
    assert.equal(
      politics.isPoliticalContent(content),
      true,
      `devrait être politique : « ${content.slice(0, 60)}… »`
    );
  }
});

test('isPoliticalContent : tweets hors politique ignorés', () => {
  const neutral = [
    'Je me remets pas de la miniature @grm_off',
    'Petit format sympa, très pressé de faire cette petite entrevue !',
    'Puis ensuite on ira debrief tout ça en allant XP dans la Marche de L’ouest !',
    'J’ai subi des dizaines de swatting, la police qui débarque armée chez moi.',
    'J’ai mangé des pâtes au pesto ce midi, c’était pas mal.',
    'Perkz, le head coach de G2 Esports, immédiatement évincé de la structure.',
    '',
  ];

  for (const content of neutral) {
    assert.equal(
      politics.isPoliticalContent(content),
      false,
      `ne devrait pas être politique : « ${content.slice(0, 60)}… »`
    );
  }
});

test('isPoliticalContent : bornes de mots (« rn » n’est pas « tournant »)', () => {
  assert.equal(politics.isPoliticalContent('Le tournant du match était incroyable'), false);
  assert.equal(politics.isPoliticalContent('Le RN progresse dans les sondages'), true);
  assert.equal(politics.isPoliticalContent('présidentielles approchent'), true);
});

test('extractMentions : personnalités et partis, ton neutre non deviné', () => {
  const mentions = politics.extractMentions(
    'Mélenchon et Lisnard s’affrontent, la France insoumise attaque le RN pendant que Zemmour regarde Marine Le Pen.'
  );

  const labels = mentions.map((mention) => mention.label);

  assert.ok(labels.includes('Jean-Luc Mélenchon'));
  assert.ok(labels.includes('David Lisnard'));
  assert.ok(labels.includes('La France insoumise'));
  assert.ok(labels.includes('Rassemblement national'));
  assert.ok(labels.includes('Éric Zemmour'));
  assert.ok(labels.includes('Marine Le Pen'));
  assert.ok(
    mentions.every((mention) => mention.stance === 'neutre'),
    'le fallback mots-clés ne devine jamais le ton'
  );
  assert.ok(
    mentions.every((mention) => mention.type === 'candidat' || mention.type === 'parti')
  );
});

test('extractMentions : accents, majuscules et apostrophes typographiques', () => {
  const mentions = politics.extractMentions(
    'Édouard PHILIPPE critique la liberté d’expression, Knafo répond.'
  );

  const labels = mentions.map((mention) => mention.label);
  assert.ok(labels.includes('Édouard Philippe'));
  assert.ok(labels.includes('Sarah Knafo'));
});

test('extractMentions : plafonné et sans doublon', () => {
  const mentions = politics.extractMentions(
    'lisnard Lisnard LISNARD mélenchon melenchon'
  );

  assert.deepEqual(mentions, [
    { label: 'David Lisnard', type: 'candidat', stance: 'neutre' },
    { label: 'Jean-Luc Mélenchon', type: 'candidat', stance: 'neutre' },
  ]);
});

test('extractMentions : texte vide ou sans entité', () => {
  assert.deepEqual(politics.extractMentions(''), []);
  assert.deepEqual(politics.extractMentions('GG WP bien joué le streamer'), []);
});

test('normalizeMentions : type et ton invalides ramenés aux défauts', () => {
  const mentions = politics.normalizeMentions([
    { label: '  David Lisnard  ', type: 'candidat', stance: 'soutien' },
    { label: 'LFI', type: 'n’importe quoi', stance: 'colère' },
    { label: '', type: 'parti', stance: 'attaque' },
    null,
    'pas un objet',
  ]);

  assert.deepEqual(mentions, [
    { label: 'David Lisnard', type: 'candidat', stance: 'soutien' },
    { label: 'LFI', type: 'personnalité', stance: 'neutre' },
  ]);
});

test('normalizeMentions : chaîne JSON tolérée, plafond respecté', () => {
  const many = Array.from({ length: 12 }, (_, index) => ({
    label: `Entité ${index}`,
    type: 'parti',
    stance: 'neutre',
  }));

  const fromJson = politics.normalizeMentions(
    JSON.stringify([{ label: 'RN', type: 'parti', stance: 'attaque' }])
  );
  assert.deepEqual(fromJson, [
    { label: 'RN', type: 'parti', stance: 'attaque' },
  ]);

  const capped = politics.normalizeMentions(many);
  assert.equal(capped.length, politics.MAX_MENTIONS);

  assert.deepEqual(politics.normalizeMentions('pas du json'), []);
  assert.deepEqual(politics.normalizeMentions(null), []);
});

test('generateMockAnalysis : tweets politiques marqués avec mentions', () => {
  const analysis = generateMockAnalysis(
    'Lisnard va gagner le débat contre Mélenchon.'
  );

  assert.equal(analysis.political, true);
  const labels = analysis.mentions.map((mention) => mention.label);
  assert.ok(labels.includes('David Lisnard'));
  assert.ok(labels.includes('Jean-Luc Mélenchon'));

  const neutral = generateMockAnalysis('J’ai mangé des pâtes au pesto.');
  assert.equal(neutral.political, false);
  assert.deepEqual(neutral.mentions, []);
});

test('repo : saveTweet marque les tweets politiques à l’import', () => {
  repo.saveTweet({
    id: 'politic-1',
    content: 'Le déficit public explose à cause des retraites.',
    posted_at: new Date().toISOString(),
    source: 'mock',
    likes: 10,
    retweets: 2,
  });

  repo.saveTweet({
    id: 'neutral-1',
    content: 'Nouvelle tier list sur le patch, ça va être tendu.',
    posted_at: new Date().toISOString(),
    source: 'mock',
    likes: 5,
    retweets: 1,
  });

  assert.equal(repo.getTweetById('politic-1').political, true);
  assert.equal(repo.getTweetById('neutral-1').political, false);
});

test('backfill : les tweets antérieurs à la fonctionnalité sont migrés une fois', () => {
  const Database = require('better-sqlite3');
  const os = require('node:os');
  const {
    ensureSchema,
    backfillElectionContext,
  } = require('../db/schema');

  const tmpPath = path.join(
    os.tmpdir(),
    `sardochemetre-backfill-${process.pid}-${Date.now()}.db`
  );
  const db = new Database(tmpPath);
  db.pragma('journal_mode = WAL');

  try {
    // Simule une base d'avant la fonctionnalité : pas de colonnes
    // political/mentions, données insérées au vieux format.
    db.exec(`CREATE TABLE tweets (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      retweets INTEGER NOT NULL DEFAULT 0,
      analyzed INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'mock'
    )`);
    db.exec(`CREATE TABLE analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tweet_id TEXT NOT NULL UNIQUE,
      bullshit_score INTEGER NOT NULL,
      verdict TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      fact_checks TEXT NOT NULL DEFAULT '[]',
      humor_comment TEXT,
      analyzed_at TEXT NOT NULL
    )`);

    const insertTweet = db.prepare(
      'INSERT INTO tweets (id, content, posted_at, analyzed) VALUES (?, ?, ?, 1)'
    );
    const insertAnalysis = db.prepare(
      'INSERT INTO analyses (tweet_id, bullshit_score, verdict, reasoning, analyzed_at) VALUES (?, 50, ?, ?, ?)'
    );

    insertTweet.run('old-1', 'Mélenchon attaque Lisnard sur les retraites.', '2026-11-01T10:00:00Z');
    insertAnalysis.run('old-1', 'DOUTEUX', 'r', '2026-11-01T11:00:00Z');
    insertTweet.run('old-2', 'Nouveau setup de stream, trop content.', '2026-11-02T10:00:00Z');
    insertAnalysis.run('old-2', 'VRAI', 'r', '2026-11-02T11:00:00Z');

    ensureSchema(db);

    const politic = db
      .prepare('SELECT political, (SELECT mentions FROM analyses WHERE tweet_id = ?) AS mentions FROM tweets WHERE id = ?')
      .get('old-1', 'old-1');
    assert.equal(politic.political, 1, 'old-1 doit être marqué politique');
    const mentions = JSON.parse(politic.mentions);
    assert.ok(
      mentions.some((mention) => mention.label === 'Jean-Luc Mélenchon'),
      'les mentions doivent être backfillées'
    );

    const neutral = db
      .prepare('SELECT political FROM tweets WHERE id = ?')
      .get('old-2');
    assert.equal(neutral.political, 0, 'old-2 reste non politique');

    // Idempotence : un second passage ne déclenche aucun scan supplémentaire
    // (aucune ligne avec political=0 ET politique détectable ne reste).
    backfillElectionContext(db);
    const recount = db
      .prepare("SELECT COUNT(*) AS n FROM tweets WHERE political = 0 AND content LIKE '%retraites%'")
      .get();
    assert.equal(recount.n, 0);
  } finally {
    db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(`${tmpPath}${suffix}`);
      } catch {
        // fichier déjà absent
      }
    }
  }
});

test('API : GET /api/tweets?theme=politics filtre les tweets politiques', async () => {
  await request('/api/tweets/analyze', {
    method: 'POST',
    body: JSON.stringify({
      content: 'Mélenchon promet la retraite à 60 ans, le déficit caution.',
      tweet_id: 'politic-1',
    }),
  });

  const { status, body } = await request(
    '/api/tweets?theme=politics&limit=50'
  );

  assert.equal(status, 200);
  assert.equal(body.theme, 'politics');
  assert.ok(body.tweets.length >= 1);
  assert.ok(body.tweets.every((tweet) => tweet.political === true));
  assert.ok(
    body.tweets.some((tweet) => tweet.id === 'politic-1'),
    'le tweet politique importé doit apparaître'
  );

  const mentions = body.tweets.find(
    (tweet) => tweet.id === 'politic-1'
  ).mentions;
  assert.ok(
    mentions.some((mention) => mention.label === 'Jean-Luc Mélenchon'),
    'la mention doit être persistée avec l’analyse'
  );
});

test('API : theme invalide refusé, absence acceptée', async () => {
  const invalid = await request('/api/tweets?theme=sport');
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /Invalid theme/);

  const none = await request('/api/tweets?limit=1');
  assert.equal(none.status, 200);
  assert.equal(none.body.theme, null);
});

test('API : GET /api/tweets/election agrège le dossier', async () => {
  const { status, body } = await request('/api/tweets/election');

  assert.equal(status, 200);
  assert.equal(body.period, 'all');
  assert.ok(Number.isFinite(body.politicalCount));
  assert.ok(body.politicalCount >= 1);
  assert.ok(body.totalAnalyzed >= body.politicalCount);
  assert.ok(Number.isFinite(body.avgPoliticalScore));
  assert.ok(Array.isArray(body.tweets));
  assert.ok(body.tweets.every((tweet) => tweet.political === true));

  const meluche = body.mentions.find(
    (mention) => mention.label === 'Jean-Luc Mélenchon'
  );
  assert.ok(meluche, 'Mélenchon doit figurer dans les mentions agrégées');
  assert.ok(meluche.total >= 1);
  assert.ok(meluche.tweetIds.includes('politic-1'));
  assert.ok(
    Number.isFinite(meluche.soutien + meluche.attaque + meluche.neutre)
  );

  assert.ok(!Number.isNaN(Date.parse(body.updatedAt)));
});

test('API : GET /api/tweets/election période invalide refusée', async () => {
  const { status, body } = await request('/api/tweets/election?period=an');

  assert.equal(status, 400);
  assert.match(body.error, /Invalid period/);
});
