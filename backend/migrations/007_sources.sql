-- Analyse approfondie : sources consultées pour le fact-check.
ALTER TABLE analyses
    ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]'::jsonb;
