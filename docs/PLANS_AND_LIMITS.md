# Plans and limits

How a Nabu account is gated. Read this before touching anything that spends money
on a user's behalf — an AI call, an R2 write, a seat.

## The short version

Every account has a `plan` (`starter` | `pro` | `business`). New accounts get
`starter`, the free tier, and everything paid is refused until they upgrade.

Three files matter:

| File                                  | Role                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/lib/utils/pricing.ts`            | The rules. Marketing matrix _and_ the machine-readable tables the server enforces. |
| `src/lib/server/entitlements.ts`      | The gate. Plan resolution, feature checks, metering, storage, seats.               |
| `migrations/0026_plans_and_usage.sql` | `users.plan` and the `usage_counters` ledger.                                      |

`tests/unit/entitlements-drift.test.ts` fails the build if the pricing page and the
gate stop agreeing, so a price change cannot quietly leave a door open.

## What the free tier gets

Monthly, resetting on the 1st (UTC):

| Allowance           | Starter | Pro | Business |
| ------------------- | ------- | --- | -------- |
| AI text generations | 50      | 500 | 5,000    |
| AI images           | 10      | 100 | 1,000    |
| AI audio            | 5       | 50  | 500      |
| AI video            | 2       | 20  | 200      |
| Scheduled posts     | 20      | 500 | 5,000    |

Ceilings on a current total rather than a monthly spend:

| Ceiling      | Starter | Pro   | Business |
| ------------ | ------- | ----- | -------- |
| Storage      | 1 GB    | 25 GB | 100 GB   |
| Team members | 1       | 3     | 10       |

Capabilities the free tier does **not** get: AI logo generation (upload only), brand
export, realtime voice chat, choosing the AI model, auto-publishing, the content
calendar, analytics.

Chatting with the assistant is included on every tier and is deliberately **not**
metered — the pricing page sells it with no number attached. Free accounts are pinned
to the default model rather than refused, because the chat UI sends its selected
model on every message and a refusal would break conversation entirely over a control
they should never have been shown.

## Using the gate

```ts
import { consumeUsage, releaseUsage, requireFeature, resolvePlan } from '$lib/server/entitlements';

const plan = await resolvePlan(db, locals.user.id);

// Boolean capability
requireFeature(plan, 'voiceChat'); // throws 402 when not included

// Monthly allowance
await consumeUsage(db, locals.user.id, 'aiVideoGenerations', plan);
try {
	await callTheExpensiveThing();
} catch (err) {
	await releaseUsage(db, locals.user.id, 'aiVideoGenerations'); // work did not happen
	throw err;
}
```

Four rules, learned the hard way:

1. **Read the plan from the database, not the session.** `resolvePlan` hits the
   `users` row. `locals.user.plan` is refreshed per request by `hooks.server.ts`, but
   the cookie itself lives seven days — long enough to outlive a downgrade. Use
   `planOf(locals.user)` only for deciding what to _show_.
2. **Consume after validation, before spending.** Earlier and a malformed request
   burns a unit; later and the provider has already been paid by the time you find
   out the allowance was gone.
3. **Release on every failure path.** A provider outage must not cost someone one of
   their two monthly videos. `releaseUsage` never throws and clamps at zero.
4. **Fail closed.** An unreadable plan, a missing row, an unrecognised value — all
   resolve to `starter`. A broken lookup should refuse a customer, never admit a
   stranger to the paid tier.

### Bulk operations

Meter per item inside the loop, not per request. Charging a batch up front is
all-or-nothing: an account with eight generations left and twenty empty fields gets
nothing instead of the eight it is owed. Catch the refusal with
`entitlementRefusal(err)`, report the rest as _skipped_, and return what was reached.
`/api/brand/assets/fill-empty-fields` and `/api/content/generate` both do this.

### The public API

`/api/v1` routes answer in their own JSON envelope, so they translate the refusal
rather than letting it throw:

```ts
try {
	await consumeUsage(db, principal.userId, 'aiImageGenerations', plan);
} catch (err) {
	const refusal = entitlementRefusal(err);
	if (!refusal) throw err;
	return apiError(402, refusal.code, refusal.message);
}
```

An API key acts as its owner, so the same limits apply. Gating only the UI would make
key minting the way around them.

## What a refusal looks like

HTTP **402**, with the numbers attached so a client can render a counter and an
upgrade link instead of a bare error:

```json
{
	"code": "plan_limit_reached",
	"message": "The Starter plan includes 2 AI video generations per month, and this month's are used up.",
	"plan": "starter",
	"metric": "aiVideoGenerations",
	"limit": 2,
	"used": 2,
	"upgradeUrl": "/pricing"
}
```

Codes: `plan_feature_locked`, `plan_limit_reached`, `plan_storage_exceeded`,
`plan_seats_exceeded`.

402 rather than 403 on purpose: this is not "you may not", it is "not on this plan" —
one is an error, the other is an upgrade prompt.

## Where the counters live

`usage_counters(user_id, metric, period, used)`, one row per account per metric per
UTC month. The period key makes the monthly reset free — a new month is a new key,
with no cron job to run and no backfill to get wrong.

The increment and the limit check are a single conditional upsert:

```sql
INSERT INTO usage_counters (user_id, metric, period, used, updated_at)
VALUES (?, ?, ?, ?, datetime('now'))
ON CONFLICT(user_id, metric, period) DO UPDATE SET used = usage_counters.used + ?
WHERE usage_counters.used + ? <= ?
RETURNING used
```

No row back means the allowance is spent. This is what makes it safe under
concurrency: read-then-write lets two requests arriving together both see the last
unit as free and both spend it, which on the free tier's two videos a month is a 100%
overrun.

## Adding a new gated thing

1. Add the metric to `METERED_LIMITS`, or the capability to `FEATURE_MATRIX_ROW` +
   `TIER_FEATURES`, in `src/lib/utils/pricing.ts`.
2. Give it a row in `PRICING_FEATURES` so it appears on /pricing — the drift test
   requires the two to agree, and a qualifier cell ("Upload only") must also be listed
   in `FEATURE_STRING_READINGS` with the access it implies.
3. Call `requireFeature` / `consumeUsage` in the route.
4. Add a case to `tests/unit/plan-gates.test.ts` proving a free account is refused
   and a paid one is not.

## Seeing where an account stands

`GET /api/account/usage` returns the whole picture for the caller: every metric with
used/limit/remaining, storage bytes, seats, and the feature grants. The profile page
renders the same snapshot server-side, so someone sent there by a 402 sees the reason
on first paint.

## Changing an account's plan

There is no billing integration yet. Today a plan is changed by writing the column:

```sh
wrangler d1 execute nabu-db --command \
  "UPDATE users SET plan = 'pro' WHERE email = 'someone@example.com'"
```

When billing arrives it should write the same column and nothing else needs to know.
