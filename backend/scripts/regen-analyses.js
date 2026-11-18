'use strict';

/**
 * Régénère toutes les analyses en base avec le prompt courant
 * (une seule fois : adieu les punchlines « commentateur foot »).
 * Usage : node scripts/regen-analyses.js [--dry]
 */
require('dotenv').config();

const repo = require('../db/sqlite');
const aiService = require('../services/aiService');

async function main() {
  const dry = process.argv.includes('--dry');
  repo.initDatabase();

  const tweets = repo
    .getDb()
    .prepare('SELECT id, content FROM tweets WHERE analyzed = 1 ORDER BY posted_at DESC')
    .all();

  console.log(`${tweets.length} analyse(s) à régénérer${dry ? ' (dry run)' : ''}`);

  let updated = 0;
  let failed = 0;

  for (const tweet of tweets) {
    const analysis = await aiService.analyzeTweet(tweet.content, { tweet });

    if (!analysis) {
      failed += 1;
      console.error(`✗ ${tweet.id} : analyse impossible`);
      continue;
    }

    if (!dry) {
      repo.upsertAnalysis(tweet.id, analysis);
    }

    updated += 1;
    console.log(
      `✓ ${tweet.id} : ${analysis.verdict} (${analysis.bullshit_score}/100)`
    );
  }

  console.log(`Terminé : ${updated} régénérée(s), ${failed} échec(s).`);
  repo.closeDatabase();
}

main().catch((error) => {
  console.error('Échec du script :', error.message);
  process.exitCode = 1;
  repo.closeDatabase();
});
