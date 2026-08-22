-- Persist provider-neutral profile fields so database-backed sessions do not lose
-- a Discord-only user's login or avatar after the OAuth callback redirects.
ALTER TABLE users ADD COLUMN profile_login TEXT;
ALTER TABLE users ADD COLUMN profile_avatar_url TEXT;

-- Preserve the existing GitHub profile for users created before these columns.
UPDATE users
SET profile_login = github_login,
    profile_avatar_url = github_avatar_url
WHERE github_login IS NOT NULL OR github_avatar_url IS NOT NULL;
