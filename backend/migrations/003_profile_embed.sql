-- Données d'embed X : média, tweet cité, compteurs et profil unique.
ALTER TABLE tweets
    ADD COLUMN IF NOT EXISTS replies INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS views BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS quoted_tweet JSONB;

CREATE TABLE IF NOT EXISTS profile (
    id INT PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    followers BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
