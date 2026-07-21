#!/usr/bin/env bash
# Provision dev API keys into .dev.vars without manual copy/paste.
#
#   ./scripts/provision-keys.sh              # everything that's automatable
#   ./scripts/provision-keys.sh google       # Google/Vertex only
#   ./scripts/provision-keys.sh cloudflare   # Cloudflare only
#   ./scripts/provision-keys.sh --status     # report, change nothing
#
# Idempotent: re-running reuses existing keys rather than minting duplicates.
# Secret VALUES are never printed -- only whether a name is set.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_VARS="$REPO_ROOT/.dev.vars"

# Project IDs are globally unique across ALL of GCP, so this carries the same
# hash suffix as the dev tunnel (dev-nabu-7bd540.ammoura.me) to avoid collisions.
GOOGLE_PROJECT="${GOOGLE_PROJECT:-nabu-dev-7bd540}"
GOOGLE_SA="nabu-dev-vertex"
GOOGLE_KEY_LABEL="nabu-dev-vertex-key"
CF_BOOTSTRAP_TOKEN_FILE="${CF_BOOTSTRAP_TOKEN_FILE:-$HOME/.cloudflared/token-admin-token}"

c_ok()   { printf '\033[32m  ok\033[0m  %s\n' "$*"; }
c_warn() { printf '\033[33mwarn\033[0m  %s\n' "$*"; }
c_err()  { printf '\033[31m fail\033[0m  %s\n' "$*" >&2; }
c_step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# Upsert KEY=VALUE in .dev.vars. Never echoes the value.
upsert_var() {
  local key="$1" val="$2"
  touch "$DEV_VARS"; chmod 600 "$DEV_VARS"
  if grep -q "^${key}=" "$DEV_VARS" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    # value via awk ENVIRON so it never lands in the process table
    VAL="$val" awk -v k="$key" \
      '{ if ($0 ~ "^" k "=") print k "=" ENVIRON["VAL"]; else print }' \
      "$DEV_VARS" > "$tmp"
    mv "$tmp" "$DEV_VARS"; chmod 600 "$DEV_VARS"
    c_ok "$key updated in .dev.vars"
  else
    printf '%s=%s\n' "$key" "$val" >> "$DEV_VARS"
    c_ok "$key added to .dev.vars"
  fi
}

has_var() { grep -q "^${1}=." "$DEV_VARS" 2>/dev/null; }

# ---------------------------------------------------------------- status ----
cmd_status() {
  c_step "Current .dev.vars"
  if [ ! -f "$DEV_VARS" ]; then
    c_warn "no .dev.vars yet"
  else
    while IFS= read -r line; do
      case "$line" in
        ''|\#*) continue ;;
        *=*) printf '  %-28s %s\n' "${line%%=*}" \
               "$([ -n "${line#*=}" ] && echo 'set' || echo 'EMPTY')" ;;
      esac
    done < "$DEV_VARS"
  fi

  c_step "Tooling"
  command -v gcloud >/dev/null && c_ok "gcloud $(gcloud version 2>/dev/null | awk '/Google Cloud SDK/{print $4}')" \
                               || c_warn "gcloud not installed"
  if command -v gcloud >/dev/null; then
    local acct; acct="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
    [ -n "$acct" ] && c_ok "gcloud authed as $acct" || c_warn "gcloud not authenticated -- run: gcloud auth login"
  fi
  [ -f "$CF_BOOTSTRAP_TOKEN_FILE" ] && c_ok "cloudflare bootstrap token present" \
                                    || c_warn "no CF bootstrap token at $CF_BOOTSTRAP_TOKEN_FILE"
}

# ---------------------------------------------------------------- google ----
cmd_google() {
  c_step "Google / Vertex AI (express mode API key)"

  command -v gcloud >/dev/null || { c_err "gcloud not on PATH"; return 1; }

  local acct; acct="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
  if [ -z "$acct" ]; then
    c_err "not authenticated. Run this once, then re-run me:"
    printf '\n      gcloud auth login\n\n'
    return 1
  fi
  c_ok "authenticated as $acct"

  # Project ------------------------------------------------------------
  if gcloud projects describe "$GOOGLE_PROJECT" >/dev/null 2>&1; then
    c_ok "project $GOOGLE_PROJECT exists"
  else
    c_warn "creating project $GOOGLE_PROJECT"
    if ! gcloud projects create "$GOOGLE_PROJECT" --name="Nabu Dev" 2>/tmp/gcp-err; then
      if grep -q "already in use" /tmp/gcp-err; then
        c_err "project ID '$GOOGLE_PROJECT' is taken (IDs are global across all of GCP)."
        printf '\n      Pick another:  GOOGLE_PROJECT=nabu-dev-xxxxx %s google\n\n' "$0"
      else
        c_err "project creation failed:"; sed 's/^/      /' /tmp/gcp-err >&2
      fi
      rm -f /tmp/gcp-err; return 1
    fi
    rm -f /tmp/gcp-err
    c_ok "project created"
  fi
  gcloud config set project "$GOOGLE_PROJECT" >/dev/null 2>&1

  # Billing (the $300 trial credit lives on a billing account) ----------
  local billing; billing="$(gcloud beta billing projects describe "$GOOGLE_PROJECT" \
      --format='value(billingEnabled)' 2>/dev/null || echo False)"
  if [ "$billing" != "True" ]; then
    c_err "billing not linked -- Vertex AI will reject requests."
    cat <<EOF

      Link the \$300 trial credit (one-time, interactive):
        1. https://console.cloud.google.com/billing  -> activate free trial
        2. gcloud beta billing accounts list
        3. gcloud beta billing projects link $GOOGLE_PROJECT --billing-account=<ID>
      Then re-run: ./scripts/provision-keys.sh google

EOF
    return 1
  fi
  c_ok "billing linked"

  # APIs ---------------------------------------------------------------
  c_warn "enabling APIs (slow on first run)"
  gcloud services enable aiplatform.googleapis.com generativelanguage.googleapis.com \
    --project="$GOOGLE_PROJECT" >/dev/null
  c_ok "aiplatform + generativelanguage enabled"

  # Service account ----------------------------------------------------
  local sa_email="${GOOGLE_SA}@${GOOGLE_PROJECT}.iam.gserviceaccount.com"
  if gcloud iam service-accounts describe "$sa_email" --project="$GOOGLE_PROJECT" >/dev/null 2>&1; then
    c_ok "service account exists"
  else
    gcloud iam service-accounts create "$GOOGLE_SA" \
      --display-name="Nabu dev Vertex" --project="$GOOGLE_PROJECT" >/dev/null
    c_ok "service account created"
  fi
  gcloud projects add-iam-policy-binding "$GOOGLE_PROJECT" \
    --member="serviceAccount:${sa_email}" --role="roles/aiplatform.user" \
    --condition=None >/dev/null 2>&1 || true
  c_ok "aiplatform.user bound"

  # Authorization key (standard keys are rejected after Sept 2026) ------
  local key_res
  key_res="$(gcloud services api-keys list --project="$GOOGLE_PROJECT" \
      --filter="displayName=$GOOGLE_KEY_LABEL" --format='value(name)' 2>/dev/null | head -1)"

  if [ -z "$key_res" ]; then
    c_warn "creating authorization key"
    gcloud beta services api-keys create \
      --display-name="$GOOGLE_KEY_LABEL" \
      --api-target=service=generativelanguage.googleapis.com \
      --api-target=service=aiplatform.googleapis.com \
      --service-account="$sa_email" \
      --project="$GOOGLE_PROJECT" >/dev/null 2>&1
    key_res="$(gcloud services api-keys list --project="$GOOGLE_PROJECT" \
        --filter="displayName=$GOOGLE_KEY_LABEL" --format='value(name)' 2>/dev/null | head -1)"
    [ -n "$key_res" ] || { c_err "key creation failed"; return 1; }
    c_ok "authorization key created"
  else
    c_ok "reusing existing authorization key"
  fi

  local key_string
  key_string="$(gcloud services api-keys get-key-string "$key_res" \
      --format='value(keyString)' 2>/dev/null)"
  [ -n "$key_string" ] || { c_err "could not read key string"; return 1; }

  upsert_var "GOOGLE_VERTEX_API_KEY" "$key_string"
  upsert_var "GOOGLE_VERTEX_PROJECT" "$GOOGLE_PROJECT"
}

# ------------------------------------------------------------ cloudflare ----
cmd_cloudflare() {
  c_step "Cloudflare API token"

  if [ ! -f "$CF_BOOTSTRAP_TOKEN_FILE" ]; then
    c_err "no bootstrap token -- Cloudflare cannot self-bootstrap."
    cat <<EOF

      Cloudflare has no way to mint the FIRST token programmatically.
      Create one by hand, once:
        1. https://dash.cloudflare.com/profile/api-tokens -> Create Token
        2. Permissions: User -> API Tokens -> Edit
        3. Save it:
             install -m600 /dev/stdin $CF_BOOTSTRAP_TOKEN_FILE <<<'PASTE_TOKEN'
      Every token after this one is automated.

EOF
    return 1
  fi

  local tok; tok="$(tr -d '[:space:]' < "$CF_BOOTSTRAP_TOKEN_FILE")"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' \
      -H "Authorization: Bearer $tok" \
      https://api.cloudflare.com/client/v4/user/tokens)"
  if [ "$code" != "200" ]; then
    c_err "bootstrap token lacks 'User -> API Tokens -> Edit' (got HTTP $code)"
    return 1
  fi
  c_ok "bootstrap token can manage tokens"

  if has_var CLOUDFLARE_API_TOKEN; then
    c_ok "CLOUDFLARE_API_TOKEN already set -- leaving alone (--force to rotate)"
    [ "${FORCE:-0}" = "1" ] || return 0
  fi

  local existing
  existing="$(curl -s -H "Authorization: Bearer $tok" \
      https://api.cloudflare.com/client/v4/user/tokens \
      | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((t["id"] for t in d.get("result") or [] if t["name"]=="nabu-dev-worker"),""))' 2>/dev/null)"
  if [ -n "$existing" ]; then
    c_warn "token 'nabu-dev-worker' exists (id ${existing:0:8}...); Cloudflare shows a value only at creation"
    c_warn "delete it in the dashboard and re-run to mint a fresh one"
    return 0
  fi

  c_err "token creation payload needs your account id + desired scopes."
  c_warn "tell me which scopes Nabu's Worker needs and I'll finish this branch"
  return 1
}

# ------------------------------------------------------------------ main ----
main() {
  case "${1:-all}" in
    --status|status) cmd_status ;;
    google)     cmd_google ;;
    cloudflare) cmd_cloudflare ;;
    all)        cmd_google || true; cmd_cloudflare || true; cmd_status ;;
    *) echo "usage: $0 [all|google|cloudflare|--status]" >&2; exit 2 ;;
  esac
}
main "$@"
