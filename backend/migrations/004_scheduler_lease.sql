-- Verrou multi-instance du scheduler et compteur de débit partagé.
CREATE TABLE IF NOT EXISTS scheduler_leases (
    name TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS analyze_rate_limits (
    client_key TEXT PRIMARY KEY,
    window_start BIGINT NOT NULL,
    count BIGINT NOT NULL
);
