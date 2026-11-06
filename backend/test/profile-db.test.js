'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const repo = require('../db/sqlite');

function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbPath}${suffix}`);
    } catch {
      // déjà absent
    }
  }
}

const AUTHOR = {
  name: 'Sardoche 🇫🇷',
  username: 'Sardoche',
  avatar_url:
    'https://pbs.twimg.com/profile_images/1777701085828022272/epxsnXzo_400x400.jpg',
  verified: true,
};

test('migration profil/embed et persistance des nouveaux champs', () => {
  const dbPath = path.join(
    os.tmpdir(),
    `sardochemetre-profile-${process.pid}-${Date.now()}.db`
  );

  try {
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE tweets (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        posted_at TIMESTAMP NOT NULL,
        likes INTEGER DEFAULT 0,
        retweets INTEGER DEFAULT 0,
        analyzed BOOLEAN DEFAULT FALSE,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO tweets (id, content, posted_at, likes, retweets, analyzed)
      VALUES ('legacy', 'Ancien tweet', '2025-01-01T00:00:00Z', 1, 2, 0);
    `);
    legacy.close();

    repo.initDatabase({ filename: dbPath });
    const db = repo.getDb();

    const columns = db
      .prepare('PRAGMA table_info(tweets)')
      .all()
      .map((row) => row.name);
    for (const column of [
      'source',
      'replies',
      'views',
      'media',
      'quoted_tweet',
    ]) {
      assert.ok(columns.includes(column), `colonne ${column} manquante`);
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    assert.ok(tables.includes('profile'));
    assert.equal(repo.getProfile(), null);

    const profile = repo.saveProfile({
      username: 'Sardoche',
      name: 'Sardoche 🇫🇷',
      avatar_url:
        'https://pbs.twimg.com/profile_images/1777701085828022272/epxsnXzo_400x400.jpg',
      verified: true,
      followers: 593077,
    });
    assert.equal(profile.username, 'Sardoche');
    assert.equal(profile.followers, 593077);
    assert.equal(profile.verified, true);
    assert.ok(!Number.isNaN(Date.parse(profile.updated_at)));

    const quotedTweet = {
      id: '8001',
      content: 'Citation',
      author: {
        name: 'GRM',
        username: 'grm_off',
        avatar_url: 'https://pbs.twimg.com/profile_images/grm_400x400.jpg',
        verified: true,
      },
      media: [
        {
          type: 'photo',
          url: 'https://pbs.twimg.com/media/quoted.jpg',
          width: 1254,
          height: 1254,
          expanded_url: 'https://x.com/grm_off/status/8001/photo/1',
        },
      ],
    };
    const media = [
      {
        type: 'photo',
        url: 'https://pbs.twimg.com/media/photo.jpg',
        width: 1303,
        height: 732,
        expanded_url: 'https://x.com/Sardoche/status/9001/photo/1',
      },
    ];

    const saved = repo.saveTweet({
      id: 'profile-1',
      content: 'Tweet profil',
      posted_at: '2026-11-05T17:51:06.000Z',
      likes: 87,
      retweets: 3,
      replies: 9,
      views: 17611,
      source: 'profile',
      author: AUTHOR,
      media,
      quoted_tweet: quotedTweet,
    });

    assert.equal(saved.source, 'profile');
    assert.equal(saved.replies, 9);
    assert.equal(saved.views, 17611);
    assert.deepEqual(saved.author, AUTHOR);
    assert.deepEqual(saved.media, media);
    assert.deepEqual(saved.quoted_tweet, quotedTweet);

    repo.saveProfile({ followers: 594000 });
    assert.equal(repo.getProfile().followers, 594000);

    repo.saveTweet({
      id: 'profile-1',
      content: 'Tweet profil mis à jour',
      posted_at: '2026-11-05T17:51:06.000Z',
      source: 'profile',
      author: AUTHOR,
    });
    assert.equal(repo.getProfile().followers, 594000);
    assert.equal(repo.getProfile().name, 'Sardoche 🇫🇷');

    const plain = repo.saveTweet({
      id: 'plain-syndication',
      content: 'Sans embed',
      posted_at: '2026-11-04T10:00:00.000Z',
      source: 'syndication',
    });
    assert.deepEqual(plain.media, []);
    assert.equal(plain.quoted_tweet, null);
    assert.equal(plain.replies, 0);
    assert.equal(plain.views, 0);
    assert.deepEqual(plain.author, AUTHOR);

    assert.equal(repo.deleteTweetsBySource('syndication'), 1);
    assert.ok(repo.getTweetById('profile-1'));
  } finally {
    repo.closeDatabase();
    cleanup(dbPath);
  }
});
