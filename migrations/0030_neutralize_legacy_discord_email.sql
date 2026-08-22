-- Discord's API can return an email address whose ownership is not verified.
-- Older callbacks persisted that value without its verification provenance,
-- which could let a later verified provider match and merge into the wrong user.
--
-- Neutralize every legacy Discord-origin account that has no password or other
-- provider identity. A subsequent Discord login can restore a currently
-- verified, non-conflicting email through the hardened callback.
--
-- The address itself is kept in `legacy_email`. Neutralizing is a security
-- action, not a reason to lose the only contact address on record: support
-- still needs to answer "who was this account?", and the value is what a
-- later verified login is expected to reproduce.
ALTER TABLE users ADD COLUMN legacy_email TEXT;

UPDATE users
SET legacy_email = email,
    email = id || '@discord.invalid',
    updated_at = CURRENT_TIMESTAMP
WHERE password_hash IS NULL
  AND EXISTS (
    SELECT 1
    FROM oauth_accounts AS discord_account
    WHERE discord_account.user_id = users.id
      AND discord_account.provider = 'discord'
      AND users.id = 'discord_' || discord_account.provider_account_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM oauth_accounts AS other_account
    WHERE other_account.user_id = users.id
      AND other_account.provider <> 'discord'
  );
