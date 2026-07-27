# Nabu Public API (v1)

Programmatic access for other applications to manage their brands and generate
assets. Base URL: `https://nabu.ammoura.me`.

Status: **v1, logos only.** Brand reads and logo generation are live. Everything
else in the app is still UI-only.

---

## Authentication

Every `/api/v1` request needs an API key as a bearer token:

```
Authorization: Bearer nabu_sk_…
```

Keys are created from your own session, never from another key — a leaked key
cannot mint a replacement that survives revoking the original.

```bash
# Create a key (browser session required)
curl -X POST https://nabu.ammoura.me/api/keys \
  -H 'Content-Type: application/json' \
  --data '{"name":"my-app","scopes":["brands:read","assets:read","assets:write"]}'
```

The response contains `key` — **the only copy that will ever exist.** Only a
SHA-256 hash is stored, so it cannot be shown again or recovered from a database
dump.

```bash
curl https://nabu.ammoura.me/api/keys                 # list (never returns key material)
curl -X DELETE https://nabu.ammoura.me/api/keys/<id>  # revoke, effective immediately
```

### Scopes

| Scope          | Grants                               |
| -------------- | ------------------------------------ |
| `brands:read`  | List and read brands                 |
| `brands:write` | Reserved; no v1 endpoint uses it yet |
| `assets:read`  | List assets and fetch their bytes    |
| `assets:write` | Generate assets                      |

There is **no hierarchy**: `assets:write` does not imply `assets:read`. Request
each scope you need. A key defaults to `["brands:read"]` — it must opt in to
mutation rather than out of it.

### Optional restrictions

- `brand_profile_id` — pins a key to one brand. Any other brand answers 404, even
  if the key's owner can see it.
- `expires_at` — ISO-8601; the key stops working at that moment.

---

## Authorisation

A key acts as the user who created it. For each brand it resolves to a role:

| Role                 | Source                   | Can write |
| -------------------- | ------------------------ | --------- |
| `owner`              | `brand_profiles.user_id` | yes       |
| `manager` / `editor` | `brand_access` grant     | yes       |
| `viewer`             | `brand_access` grant     | no        |

**A brand you cannot reach returns 404, not 403.** That is deliberate: 403 would
confirm the id exists to someone with no business knowing.

---

## Errors

Every failure uses one envelope, so clients can branch on `code` rather than
parsing prose:

```json
{
	"error": {
		"code": "insufficient_scope",
		"message": "This key is missing the `assets:write` scope."
	}
}
```

| Status | Codes                                                                                        |
| ------ | -------------------------------------------------------------------------------------------- |
| 400    | `invalid_json`, `invalid_body`, `invalid_style`, `instruction_too_long`, `unsupported_model` |
| 401    | `missing_credentials`, `invalid_key`                                                         |
| 403    | `insufficient_scope`, `read_only_access`                                                     |
| 404    | `brand_not_found`, `asset_not_found`                                                         |
| 410    | `asset_content_missing`                                                                      |
| 502    | `generation_failed`                                                                          |
| 503    | `unavailable`, `ai_unavailable`, `storage_unavailable`                                       |

Unknown, revoked and expired keys all answer `invalid_key`. Distinguishing them
would let a caller probe which keys exist.

---

## Endpoints

### `GET /api/v1/brands`

Scope: `brands:read`. Brands the key can reach — owned plus shared — newest first,
capped at 100.

```json
{
	"data": [
		{
			"id": "30a68077-…",
			"name": "DanceMonkey",
			"tagline": null,
			"status": "in_progress",
			"industry": "entertainment",
			"colors": { "primary": null, "secondary": null, "accent": null },
			"logo_url": "/api/brand/assets/file?key=…",
			"role": "owner",
			"created_at": "…",
			"updated_at": "…"
		}
	]
}
```

### `GET /api/v1/brands/:id/logos`

Scope: `assets:read`. Logo assets for the brand, plus which one is currently
assigned.

### `POST /api/v1/brands/:id/logos`

Scope: `assets:write`. Generates a logo and stores it as an asset.

```bash
curl -X POST https://nabu.ammoura.me/api/v1/brands/<brand-id>/logos \
  -H "Authorization: Bearer $NABU_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"style":"lettermark","instruction":"geometric, single weight"}'
```

| Field         | Type    | Default         | Notes                                                    |
| ------------- | ------- | --------------- | -------------------------------------------------------- |
| `style`       | enum    | `abstract`      | `wordmark`, `lettermark`, `abstract`, `mascot`, `emblem` |
| `instruction` | string  | —               | Extra direction, max 500 chars                           |
| `set_as_logo` | boolean | `false`         | Assign the result as the brand's logo                    |
| `model`       | string  | Workers AI FLUX | v1 accepts Workers AI image models only                  |

**`set_as_logo` defaults to `false` on purpose.** Generating and choosing are
separate decisions; an app will usually want to offer candidates before
overwriting the mark a brand already uses.

Returns `201`:

```json
{
	"data": {
		"id": "0b0bcc49-…",
		"generation_id": "…",
		"url": "/api/v1/brands/<brand-id>/assets/<asset-id>/content",
		"style": "lettermark",
		"prompt": "Design a monogram built from…",
		"model": "@cf/black-forest-labs/flux-1-schnell",
		"width": 1024,
		"height": 1024,
		"set_as_logo": false
	}
}
```

Runs **synchronously** — Workers AI returns inline, so one request yields a
finished asset with no polling. A failure still leaves a generation record, and its
id appears in the error message so you can correlate the two.

The prompt is built from the brand's own name, industry, personality and palette,
plus constraints that keep output usable as a mark (flat vector, high contrast,
legible small, no gradients or photorealism). Prose accidentally stored in a colour
field is ignored rather than passed to the model as a colour.

### `GET /api/v1/brands/:id/assets/:assetId/content`

Scope: `assets:read`. Streams the asset's bytes.

Asset URLs returned by this API point here, **not** at the app's own
`/api/brand/assets/file` route — that one needs a browser session and would be a
dead link to an API client. The lookup is scoped to the brand in the path, so an
asset id from another brand resolves to nothing.

---

## Quotas

Generation consumes the brand owner's AI allowance (see the pricing tiers). v1 does
not rate-limit per key; `request_count` and `last_used_at` are tracked per key and
visible in `GET /api/keys`.
