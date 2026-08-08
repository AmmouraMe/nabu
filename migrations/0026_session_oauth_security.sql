-- Persist one-time OAuth transactions. Raw state and session tokens remain browser-only;
-- D1 stores SHA-256 digests so a database read cannot mint either credential.
CREATE TABLE IF NOT EXISTS oauth_transactions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('github', 'discord')),
  intent TEXT NOT NULL CHECK(intent IN ('login', 'link')),
  user_id TEXT,
  session_id TEXT,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((intent = 'login' AND user_id IS NULL AND session_id IS NULL)
     OR (intent = 'link' AND user_id IS NOT NULL AND session_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expires_at ON oauth_transactions(expires_at);

-- Provider tokens are needed only during callback identity lookup.
UPDATE oauth_accounts SET access_token = NULL, refresh_token = NULL
WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL;

-- Existing cookies contain identities rather than opaque tokens. Revoke them during
-- this format transition so they cannot be mistaken for authoritative sessions.
DELETE FROM sessions;
