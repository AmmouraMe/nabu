# Discord login

The Discord login rules shared by NebulaKit and every site built on it. They came from running
Discord login on PinFool and the other NebulaKit sites; each exists because the simpler version went
wrong. Nabu follows them, with the differences listed at the end.

## Flow

`/api/auth/discord` starts the flow (scope `identify email`, signed state, single-use transaction).
`/api/auth/discord/callback` exchanges the code, reads the Discord profile, reconciles it with an
account (`reconcileOAuthAccount`), applies the profile (`applyDiscordProfile`) and signs the person in
(`finalizeOAuthLogin`). Credentials come from `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`, or the
admin Auth keys page (stored sealed in KV).

## What Discord may say about an account

All of it is decided in `src/lib/utils/discord-identity.ts` (pure, property tested).

- **Only a verified address matches an account.** Discord returns unverified addresses too; matching
  one would let anyone who registers a Discord account with a victim's email take that account over.
- **No address, no problem.** A new account without a verified one gets `username@discord.local`, a
  placeholder that is never treated as verified and never mailed. `users.email` is unique, so if that
  placeholder is taken the account gets a per-account `<id>-<uuid>@discord.invalid` instead.
- **A placeholder is replaced, a chosen address never is.** On the next sign-in with a verified
  address, a `@discord.local` or `@discord.invalid` placeholder becomes the real one (migration 0030
  left every legacy Discord account on a `@discord.invalid` placeholder for exactly this). An
  address the person picked stays.
- **`users.email_verified_at`** is set only when Discord confirmed the address the account holds.
  Gate anything on it that must not be claimed by typing an address into a form (store credit,
  order history).
- **Avatar** is always an `https://cdn.discordapp.com` URL, built from an id and hash that look like
  Discord's own, else one of the six default avatars. It is stored in `users.profile_avatar_url` (what
  the session shows) and in `users.github_avatar_url` on every Discord sign-in.
- **`users.last_login_at`** is written on every sign-in, whatever the provider.
- Every profile step fails soft: a missing picture or an unmigrated column never blocks a sign-in.

Migration `0031_user_email_verified_last_login.sql` adds the two columns. Until it runs, sign-in
still works and these two facts are simply not recorded.

## Where Nabu differs from the template

- **No email matching at all.** `reconcileOAuthAccount` never matches an account by address (password
  signup does not verify email, so that would be an account-takeover path). The verified-only rule
  therefore applies to what may be _stored_ on a new account, not to a lookup: an unverified address
  is ignored, a verified one is used only when no other account holds it.
- **Linking is not a sign-in.** Connecting Discord to an already-signed-in account changes only the
  link: no rename, no avatar, no email, and no `applyDiscordProfile`. The next Discord sign-in applies
  the profile.
- **`github_avatar_url` is shared with GitHub.** A GitHub avatar is never replaced by a Discord one
  there; only an empty column or an earlier Discord avatar is overwritten. The session avatar comes
  from `profile_avatar_url`, which Discord does write when it is the account's identity.
- **`last_login_at` is written by `finalizeOAuthLogin`** (GitHub and Discord). Password login does not
  write it yet.
