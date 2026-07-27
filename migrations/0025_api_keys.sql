-- Public API keys, so other applications can manage their brands and assets
-- programmatically instead of driving the UI.
--
-- Only a SHA-256 hash of the key is stored. The plaintext is returned once, at
-- creation, and is unrecoverable afterwards — a leaked database must not hand an
-- attacker working credentials. `key_prefix` exists purely so a key can be
-- identified in a list ("nabu_live_a1b2…") without storing anything usable.
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  -- Owner of the key. Requests act as this user, so every brand authorisation
  -- decision resolves through them.
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- SHA-256 of the plaintext key, hex encoded.
  key_hash TEXT NOT NULL UNIQUE,
  -- First few visible characters, for display only.
  key_prefix TEXT NOT NULL,
  -- JSON array of scopes, e.g. ["brands:read","assets:write"]. Absent or empty
  -- means read-only: a key must opt in to mutation, never out of it.
  scopes TEXT NOT NULL DEFAULT '["brands:read"]',
  -- Optional hard restriction to a single brand. NULL means "every brand this
  -- user can reach", which is broader, so it must be the deliberate choice rather
  -- than the accident of leaving a column unset.
  brand_profile_id TEXT REFERENCES brand_profiles(id) ON DELETE CASCADE,
  -- Revocation is a timestamp rather than a delete, so an audit trail survives
  -- and a compromised key cannot be quietly made to look like it never existed.
  revoked_at TEXT,
  last_used_at TEXT,
  -- Cheap abuse signal; not a billing record.
  request_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Lookup is by hash on every single API request, so it must be indexed. UNIQUE on
-- key_hash already provides this, but the partial index keeps the common case —
-- live keys for a user — cheap to list.
CREATE INDEX idx_api_keys_user ON api_keys(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_brand ON api_keys(brand_profile_id);
