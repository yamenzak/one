# shellcheck shell=bash
#
# Cloudflare REST helpers for the reset workflow.
#
# ── Why these exist rather than inline curl ──────────────────────────────────
#
# Two failure modes, both of which turn a destructive workflow into a liar:
#
#   **A non-2xx that reads as success.** `curl` exits 0 on an HTTP 403 unless
#   you ask otherwise, so `curl … | jq -r '.result[]?'` on a permissions failure
#   yields an empty list — indistinguishable from "there is nothing here". In an
#   inventory step that means "nothing to delete"; in a create step it means the
#   id you paste into the config is `null`.
#
#   **A 200 that is not success.** Cloudflare answers many failures with HTTP
#   200 and `{"success": false, "errors": [...]}`. Checking the status code
#   alone is not enough, which is why every helper checks `.success` too.
#
# So: fail on both, and print what Cloudflare actually said. A destructive
# workflow that cannot tell "denied" from "absent" is worse than no workflow.

cf_api="https://api.cloudflare.com/client/v4"

# Internal: run a request, check transport + envelope, echo the JSON body.
_cf() {
  local method="$1" path="$2" body="${3:-}"
  local out code
  if [ -n "$body" ]; then
    out=$(curl -sS -w $'\n%{http_code}' -X "$method" "$cf_api/$path" \
      -H "Authorization: Bearer $CF_TOKEN" \
      -H "Content-Type: application/json" \
      --data "$body")
  else
    out=$(curl -sS -w $'\n%{http_code}' -X "$method" "$cf_api/$path" \
      -H "Authorization: Bearer $CF_TOKEN")
  fi
  code=$(printf '%s' "$out" | tail -1)
  out=$(printf '%s' "$out" | sed '$d')

  if [ "$code" -ge 400 ] 2>/dev/null; then
    echo "::error::Cloudflare $method $path → HTTP $code" >&2
    printf '%s' "$out" | jq -r '.errors[]? | "  \(.code): \(.message)"' >&2 2>/dev/null || printf '%s\n' "$out" >&2
    return 1
  fi
  if ! printf '%s' "$out" | jq -e '.success == true' >/dev/null 2>&1; then
    echo "::error::Cloudflare $method $path returned success=false" >&2
    printf '%s' "$out" | jq -r '.errors[]? | "  \(.code): \(.message)"' >&2 2>/dev/null || printf '%s\n' "$out" >&2
    return 1
  fi
  printf '%s' "$out"
}

cf_get()    { _cf GET    "$1"; }
cf_delete() { _cf DELETE "$1" >/dev/null; }
cf_post()   { _cf POST   "$1" "$2"; }

# Keep only lines whose FIRST field starts with one of the comma-separated
# `PATTERNS`. Anchored deliberately: an unanchored match would let a pattern
# like `kova` claim a resource merely containing that substring, and this filter
# is the only thing standing between a reset and someone else's data.
mine() {
  local re
  re="^($(printf '%s' "$PATTERNS" | tr ',' '|'))"
  grep -iE "$re" "$1" || true
}
