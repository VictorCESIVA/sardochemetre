-- Contexte de réponse : tweet parent (récupéré via le détail public X).
ALTER TABLE tweets
    ADD COLUMN IF NOT EXISTS reply_to JSONB;
