-- Tweets table
CREATE TABLE IF NOT EXISTS tweets (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    posted_at TIMESTAMP NOT NULL,
    likes INT DEFAULT 0,
    retweets INT DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'mock',
    analyzed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Analyses table
CREATE TABLE IF NOT EXISTS analyses (
    id SERIAL PRIMARY KEY,
    tweet_id TEXT REFERENCES tweets(id) ON DELETE CASCADE,
    bullshit_score INT NOT NULL CHECK (bullshit_score >= 0 AND bullshit_score <= 100),
    verdict TEXT NOT NULL CHECK (verdict IN ('VRAI', 'DOUTEUX', 'BULLSHIT', 'CHAUD BOUILLANT')),
    reasoning TEXT NOT NULL,
    fact_checks JSONB,
    humor_comment TEXT,
    analyzed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tweet_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tweets_posted_at ON tweets(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_analyzed ON tweets(analyzed);
CREATE INDEX IF NOT EXISTS idx_analyses_tweet_id ON analyses(tweet_id);
CREATE INDEX IF NOT EXISTS idx_analyses_analyzed_at ON analyses(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_verdict ON analyses(verdict);
