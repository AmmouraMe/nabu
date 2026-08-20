-- Account plans and the metering that enforces them.
--
-- Until now every account had identical rights: `src/lib/utils/pricing.ts` described
-- three tiers to visitors on /pricing, but nothing in the application read a tier, so
-- a brand-new free signup could generate unlimited AI video, open a realtime voice
-- session and auto-publish — all of it billed to us. These two objects are what turn
-- that marketing copy into a rule the server can enforce.

-- Which tier an account is on. Everyone starts on 'starter' (the free plan): the
-- default has to be the *least* privileged value, so a row created by a path that
-- never heard of plans — OAuth callbacks, the dev login, ensureSessionUserRecord —
-- fails closed rather than silently provisioning a paid account.
--
-- Deliberately un-CHECKed: D1 rewrites the table to add a constraint, and an
-- unrecognised value is already handled — `normalizePlan()` in
-- `src/lib/server/entitlements.ts` maps anything it does not recognise back to
-- 'starter', so a bad write degrades to the free tier instead of an open one.
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'starter';

-- Monthly consumption per account, one row per (account, metric, month).
--
-- `period` is a UTC 'YYYY-MM' string rather than a rolling window: it makes the
-- monthly reset free (a new month is simply a new key, no cron job to run and no
-- backfill to get wrong) and it makes the counter row itself the concurrency
-- control. Callers increment with a conditional upsert that only writes while
-- `used < limit`, so two simultaneous requests at the boundary cannot both pass —
-- see `consumeUsage()`.
--
-- This is a quota ledger, not a billing record: rows are safe to drop for an old
-- period, and nothing downstream reads history.
CREATE TABLE IF NOT EXISTS usage_counters (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Metric key from TIER_METRICS in src/lib/utils/pricing.ts, e.g. 'aiVideoGenerations'.
  metric TEXT NOT NULL,
  -- UTC calendar month, 'YYYY-MM'.
  period TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, metric, period)
);

-- Reading "everything this account used this month" is the usage panel's only query.
CREATE INDEX IF NOT EXISTS idx_usage_counters_user_period ON usage_counters(user_id, period);
