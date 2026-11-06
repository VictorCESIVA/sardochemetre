-- Source des tweets : mock | x | syndication
ALTER TABLE tweets
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'mock';

CREATE INDEX IF NOT EXISTS idx_tweets_source ON tweets(source);
