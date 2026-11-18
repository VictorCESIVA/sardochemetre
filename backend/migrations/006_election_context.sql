-- Dossier élection 2027 : tweet politique + mentions de personnalités.
ALTER TABLE tweets
    ADD COLUMN IF NOT EXISTS political BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE analyses
    ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tweets_political ON tweets (political);
