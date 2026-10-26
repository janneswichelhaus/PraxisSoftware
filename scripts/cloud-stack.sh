#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Supabase-Stack ohne Docker - fuer die Cloud-Entwicklungsumgebung.
#
# `supabase start` laeuft dort nicht (der Egress-Proxy liefert keine
# Container-Images). Dieses Skript zieht denselben Integrationspfad aus
# Release-Binaries hoch, damit eine Session die Anwendung hinter der Anmeldung
# durchklicken, fotografieren und `pnpm test:e2e --project authenticated`
# laufen lassen kann:
#
#   PostgreSQL 16 (lokal)   .tmp/stack-pgdata, Port 54339
#   GoTrue (supabase/auth)  Anmeldedienst mit seinen eigenen Migrationen
#   PostgREST               dasselbe JWT-Secret
#   Edge Functions          supabase/functions in Deno (scripts/cloud-stack/functions.mjs)
#   Gateway (Node)          Port 54321 wie Kong; Storage-API als Nachbildung
#
# Danach alle Migrationen aus supabase/migrations in Reihenfolge und
# supabase/seed.sql. Mit `reset --reich` zusaetzlich die synthetischen
# Testpatient:innen und die Praxiswoche der Test-Umgebung.
#
# Alles liegt unter .tmp/ (nicht versioniert): Binaries in .tmp/bin, Daten in
# .tmp/stack-pgdata, Logs, Schluessel und Dateien in .tmp/stack. Das
# JWT-Secret entsteht beim ersten Start zufaellig; das Skript schreibt die
# Verbindungswerte in die ungetrackte .env.development.local - nicht in
# .env.local: die liest auch Vitest (Modus test), und mit echten Werten fragen
# einzelne Unit-Tests den Stack wirklich an und scheitern. Ausschliesslich
# synthetische Daten (PROJECT_PRINCIPLES.md 3.1), alle Dienste lauschen nur
# auf 127.0.0.1.
#
# Port 54329 gehoert `pnpm test:db` (scripts/test-db.sh) und wird hier nie
# angefasst.
#
# Aufruf: ./scripts/cloud-stack.sh start [--reich] | stop | reset [--reich] | status
# (--reich wirkt nur, wenn die Datenbank dabei neu entsteht.)
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERE="$ROOT/scripts/cloud-stack"
STATE="$ROOT/.tmp/stack"
PGDATA="$ROOT/.tmp/stack-pgdata"
BIN="$ROOT/.tmp/bin"

DB_PORT="${STACK_DB_PORT:-54339}"
API_PORT="${STACK_API_PORT:-54321}"
AUTH_PORT="${STACK_AUTH_PORT:-54336}"
REST_PORT="${STACK_REST_PORT:-54337}"
FUNCTIONS_PORT="${STACK_FUNCTIONS_PORT:-54338}"
APP_URL="${STACK_APP_URL:-http://127.0.0.1:5173}"
API_URL="http://127.0.0.1:$API_PORT"
DB_URL="postgresql://postgres@127.0.0.1:$DB_PORT/postgres"

# Feste Versionen und Pruefsummen (am 2026-10-12 von den GitHub-Releases
# geladen). GoTrue und PostgREST sind dieselben, die `supabase@2.116.0`
# startet (docs/DEVELOPMENT.md, .github/workflows/ci.yml) - beim Anheben der
# CLI hier mitziehen. Wichtig ist das vor allem bei PostgREST: v12 bis v14
# wiederholen eine Transaktion, die mit SQLSTATE 40001 abbricht, endlos (am
# 2026-10-12 geprueft: v12.2.12, v13.0.8, v14.0, v14.18), und genau so melden
# die Migrationen "changed meanwhile"; v16.1 antwortet sofort. Eine neue
# Version wird bewusst von Hand gesetzt, samt neuer Pruefsumme.
GOTRUE_VERSION="v2.196.0"
GOTRUE_SHA256="69aa7b9e519f33f66455c057d622414c7e79c9b33e0907af622fd22cb303512d"
POSTGREST_VERSION="v16.1"
POSTGREST_SHA256="b986c926cf16a1c5d97954c57d3a6edd894a5da225c3f3fc0c25dc4105009dd7"
DENO_VERSION="v2.9.7"
DENO_SHA256="c6527f24f4b16031d3ae4fa9f658d5f11534c8d84ce7dc8502420280919c3490"

GOTRUE_DIR="$BIN/auth-$GOTRUE_VERSION"
POSTGREST_DIR="$BIN/postgrest-$POSTGREST_VERSION"
DENO_DIR_BIN="$BIN/deno-$DENO_VERSION"

info() { echo "> $*"; }
fail() {
  echo "FEHLER: $*" >&2
  exit 1
}

for port in "$DB_PORT" "$API_PORT" "$AUTH_PORT" "$REST_PORT" "$FUNCTIONS_PORT"; do
  if [ "$port" = "54329" ]; then
    fail "Port 54329 gehoert pnpm test:db (scripts/test-db.sh) und ist hier ausgeschlossen."
  fi
done

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"

RUN_AS=""
if [ "$(id -u)" -eq 0 ]; then
  id postgres >/dev/null 2>&1 || fail "Als root ohne System-Benutzer 'postgres' kann kein Cluster starten."
  RUN_AS="postgres"
fi

run_pg() {
  if [ -n "$RUN_AS" ]; then su "$RUN_AS" -c "$1"; else bash -c "$1"; fi
}

psql_db() {
  "$PGBIN/psql" "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"
}

# --- Prozesse ----------------------------------------------------------------

pid_of() {
  local file="$STATE/$1.pid"
  [ -f "$file" ] || return 1
  local pid
  pid="$(cat "$file")"
  kill -0 "$pid" 2>/dev/null || return 1
  echo "$pid"
}

launch() {
  local name="$1"
  shift
  if pid_of "$name" >/dev/null; then
    info "$name laeuft bereits"
    return 0
  fi
  setsid nohup "$@" >>"$STATE/$name.log" 2>&1 </dev/null &
  echo $! >"$STATE/$name.pid"
}

halt() {
  local name="$1" pid
  if pid="$(pid_of "$name")"; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 50); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    kill -9 "$pid" 2>/dev/null || true
    info "$name gestoppt"
  fi
  rm -f "$STATE/$name.pid"
}

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

ensure_port_free() {
  if port_open "$1"; then
    fail "Port $1 ($2) ist schon belegt - laeuft ein Stack aus einer anderen Arbeitskopie? Dort ./scripts/cloud-stack.sh stop oder STACK_*_PORT setzen."
  fi
}

wait_for_http() {
  local name="$1" url="$2"
  for _ in $(seq 1 150); do
    if curl -fsS -o /dev/null --noproxy '*' "$url" 2>/dev/null; then return 0; fi
    if ! pid_of "$name" >/dev/null; then
      tail -n 20 "$STATE/$name.log" >&2 || true
      fail "$name ist beim Start beendet worden (Log: .tmp/stack/$name.log)."
    fi
    sleep 0.2
  done
  tail -n 20 "$STATE/$name.log" >&2 || true
  fail "$name antwortet nicht unter $url (Log: .tmp/stack/$name.log)."
}

# --- Binaries ----------------------------------------------------------------

fetch() {
  local label="$1" url="$2" sha="$3" target="$4" kind="$5"
  [ -d "$target" ] && return 0
  mkdir -p "$BIN/downloads"
  local archive
  archive="$BIN/downloads/$(basename "$url")"
  if [ ! -f "$archive" ]; then
    info "Lade $label ($url)"
    curl -fsSL --retry 3 -o "$archive.part" "$url" || fail "Download von $label fehlgeschlagen."
    mv "$archive.part" "$archive"
  fi
  if ! echo "$sha  $archive" | sha256sum -c --status; then
    rm -f "$archive"
    fail "Pruefsumme von $label stimmt nicht - Download verworfen."
  fi
  rm -rf "$target.part"
  mkdir -p "$target.part"
  case "$kind" in
    tgz) tar -xzf "$archive" -C "$target.part" ;;
    txz) tar -xJf "$archive" -C "$target.part" ;;
    zip) unzip -q -o "$archive" -d "$target.part" ;;
  esac
  mv "$target.part" "$target"
  rm -f "$archive"
}

prune_old_versions() {
  local dir
  for dir in "$BIN"/auth-* "$BIN"/postgrest-* "$BIN"/deno-*; do
    [ -d "$dir" ] || continue
    case "$dir" in
      "$GOTRUE_DIR" | "$POSTGREST_DIR" | "$DENO_DIR_BIN") ;;
      *) rm -rf "$dir" ;;
    esac
  done
}

fetch_binaries() {
  [ "$(uname -m)" = "x86_64" ] || fail "Nur fuer x86_64 eingerichtet (gefunden: $(uname -m))."
  prune_old_versions
  fetch "GoTrue $GOTRUE_VERSION" \
    "https://github.com/supabase/auth/releases/download/$GOTRUE_VERSION/auth-$GOTRUE_VERSION-x86.tar.gz" \
    "$GOTRUE_SHA256" "$GOTRUE_DIR" tgz
  fetch "PostgREST $POSTGREST_VERSION" \
    "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x86-64.tar.xz" \
    "$POSTGREST_SHA256" "$POSTGREST_DIR" txz
  if [ "${STACK_FUNCTIONS:-1}" != "0" ]; then
    fetch "Deno $DENO_VERSION" \
      "https://github.com/denoland/deno/releases/download/$DENO_VERSION/deno-x86_64-unknown-linux-gnu.zip" \
      "$DENO_SHA256" "$DENO_DIR_BIN" zip
  fi
}

# --- PostgreSQL --------------------------------------------------------------

start_postgres() {
  [ -n "$PGBIN" ] || fail "Kein lokaler PostgreSQL-Server gefunden (/usr/lib/postgresql/*/bin)."
  if [ ! -d "$PGDATA" ]; then
    info "initdb -> .tmp/stack-pgdata"
    mkdir -p "$PGDATA"
    chmod 700 "$PGDATA"
    if [ -n "$RUN_AS" ]; then chown "$RUN_AS" "$PGDATA"; fi
    run_pg "'$PGBIN/initdb' -D '$PGDATA' -U postgres --auth=trust --encoding=UTF8 --locale=C" >/dev/null
  fi
  touch "$STATE/postgres.log"
  if [ -n "$RUN_AS" ]; then chown "$RUN_AS" "$STATE/postgres.log"; fi
  if run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' status" >/dev/null 2>&1; then
    info "PostgreSQL laeuft bereits (Port $DB_PORT)"
  else
    ensure_port_free "$DB_PORT" PostgreSQL
    info "Starte PostgreSQL auf Port $DB_PORT"
    run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -l '$STATE/postgres.log' -o '-p $DB_PORT -k $PGDATA -c listen_addresses=127.0.0.1' -w start" >/dev/null
  fi
}

stop_postgres() {
  [ -n "$PGBIN" ] && [ -d "$PGDATA" ] || return 0
  if run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' status" >/dev/null 2>&1; then
    run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -m fast -w stop" >/dev/null
    info "PostgreSQL gestoppt"
  fi
}

bootstrapped() {
  [ "$(psql_db -At -c "select count(*) from pg_namespace where nspname = 'supabase_migrations'")" = "1" ]
}

# --- Dienste -----------------------------------------------------------------

start_gotrue() {
  if pid_of gotrue >/dev/null; then
    info "GoTrue laeuft bereits"
    return 0
  fi
  # Werte aus supabase/config.toml ([auth], [auth.email], [auth.webauthn]);
  # was dort fehlt, wie die Supabase-CLI (MFA per App oder Telefon aus).
  local gotrue_env=(
    API_EXTERNAL_URL="$API_URL/auth/v1"
    GOTRUE_API_HOST=127.0.0.1
    GOTRUE_API_PORT="$AUTH_PORT"
    GOTRUE_DB_DRIVER=postgres
    GOTRUE_DB_DATABASE_URL="postgresql://supabase_auth_admin@127.0.0.1:$DB_PORT/postgres?sslmode=disable"
    GOTRUE_DB_MIGRATIONS_PATH="$GOTRUE_DIR/migrations"
    GOTRUE_DB_NAMESPACE=auth
    GOTRUE_SITE_URL="$APP_URL"
    GOTRUE_URI_ALLOW_LIST="$APP_URL,$APP_URL/zugang"
    GOTRUE_DISABLE_SIGNUP=true
    GOTRUE_EXTERNAL_EMAIL_ENABLED=true
    GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false
    GOTRUE_MAILER_AUTOCONFIRM=true
    GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true
    GOTRUE_MAILER_OTP_EXP=3600
    GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true
    GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10
    GOTRUE_PASSWORD_MIN_LENGTH=12
    GOTRUE_JWT_SECRET="$STACK_JWT_SECRET"
    GOTRUE_JWT_EXP=3600
    GOTRUE_JWT_AUD=authenticated
    GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
    GOTRUE_JWT_ADMIN_ROLES=service_role
    GOTRUE_JWT_ISSUER="$API_URL/auth/v1"
    GOTRUE_EXTERNAL_PHONE_ENABLED=false
    GOTRUE_MFA_TOTP_ENROLL_ENABLED=false
    GOTRUE_MFA_TOTP_VERIFY_ENABLED=false
    GOTRUE_MFA_PHONE_ENROLL_ENABLED=false
    GOTRUE_MFA_PHONE_VERIFY_ENABLED=false
    GOTRUE_MFA_WEB_AUTHN_ENROLL_ENABLED=false
    GOTRUE_MFA_WEB_AUTHN_VERIFY_ENABLED=false
    GOTRUE_PASSKEY_ENABLED=true
    GOTRUE_WEBAUTHN_RP_DISPLAY_NAME=Praxis
    GOTRUE_WEBAUTHN_RP_ID=localhost
    GOTRUE_WEBAUTHN_RP_ORIGINS=http://localhost:5173
    GOTRUE_LOG_LEVEL=warn
  )
  info "GoTrue: eigene Migrationen fuer das Schema auth"
  env "${gotrue_env[@]}" "$GOTRUE_DIR/auth" migrate >>"$STATE/gotrue.log" 2>&1 ||
    fail "GoTrue-Migrationen fehlgeschlagen (Log: .tmp/stack/gotrue.log)."
  ensure_port_free "$AUTH_PORT" GoTrue
  info "Starte GoTrue $GOTRUE_VERSION (intern auf Port $AUTH_PORT)"
  launch gotrue env "${gotrue_env[@]}" "$GOTRUE_DIR/auth" serve
  wait_for_http gotrue "http://127.0.0.1:$AUTH_PORT/health"
}

apply_migrations() {
  local applied=0 file version
  for file in "$ROOT"/supabase/migrations/*.sql; do
    version="$(basename "$file" | cut -d_ -f1)"
    if [ "$(psql_db -At -c "select count(*) from supabase_migrations.schema_migrations where version = '$version'")" = "1" ]; then
      continue
    fi
    psql_db -1 -f "$file" \
      -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$(basename "$file" .sql)')" \
      >>"$STATE/migrations.log" 2>&1 ||
      {
        tail -n 20 "$STATE/migrations.log" >&2
        fail "Migration $(basename "$file") fehlgeschlagen (Log: .tmp/stack/migrations.log)."
      }
    applied=$((applied + 1))
  done
  info "Migrationen: $applied neu eingespielt"
}

seed() {
  info "Seed: supabase/seed.sql"
  psql_db -1 -f "$ROOT/supabase/seed.sql" >>"$STATE/migrations.log" 2>&1 ||
    fail "Seed fehlgeschlagen (Log: .tmp/stack/migrations.log)."
  if [ "${RICH_DATA:-0}" = "1" ]; then
    # Nur die synthetischen Zusatzdaten der Test-Umgebung, nicht kennung.sql
    # und zugang.sql: Die ersetzen die Kennwoerter und sind fuer die
    # oeffentliche Test-Umgebung gedacht. Die E2E-Tests zaehlen auf den
    # schlanken Seed - fuer sie `reset` ohne --reich.
    info "Zusatzdaten: supabase/testumgebung/testpatienten.sql und praxiswoche.sql"
    psql_db -1 -f "$ROOT/supabase/testumgebung/testpatienten.sql" \
      -f "$ROOT/supabase/testumgebung/praxiswoche.sql" >>"$STATE/migrations.log" 2>&1 ||
      fail "Zusatzdaten fehlgeschlagen (Log: .tmp/stack/migrations.log)."
  fi
}

start_postgrest() {
  if pid_of postgrest >/dev/null; then
    info "PostgREST laeuft bereits - Schema neu laden"
    psql_db -c "notify pgrst, 'reload schema'"
    return 0
  fi
  # Werte aus supabase/config.toml ([api]).
  cat >"$STATE/postgrest.conf" <<EOF
db-uri = "postgresql://authenticator@127.0.0.1:$DB_PORT/postgres"
db-schemas = "public"
db-extra-search-path = "public, extensions"
db-anon-role = "anon"
db-max-rows = 200
db-pool = 10
jwt-secret = "$STACK_JWT_SECRET"
server-host = "127.0.0.1"
server-port = $REST_PORT
log-level = "error"
EOF
  chmod 600 "$STATE/postgrest.conf"
  ensure_port_free "$REST_PORT" PostgREST
  info "Starte PostgREST $POSTGREST_VERSION (intern auf Port $REST_PORT)"
  launch postgrest "$POSTGREST_DIR/postgrest" "$STATE/postgrest.conf"
  wait_for_http postgrest "http://127.0.0.1:$REST_PORT/"
}

start_functions() {
  if [ "${STACK_FUNCTIONS:-1}" = "0" ]; then
    info "Edge Functions ausgelassen (STACK_FUNCTIONS=0)"
    return 0
  fi
  local extra_env=()
  if [ -f "$ROOT/supabase/functions/.env.local" ]; then
    # Wie `supabase functions serve --env-file supabase/functions/.env.local`.
    while IFS= read -r line; do
      case "$line" in '' | '#'*) continue ;; esac
      extra_env+=("$line")
    done <"$ROOT/supabase/functions/.env.local"
  else
    # Ohne eigene Datei: der Kartendienst als Nachbildung, freigegeben nur fuer
    # synthetische Daten (ADR-019 Punkte 15 und 36), und das AI Gateway mit
    # seiner Nachbildung (KI-EPIC-001, ADR-005 Punkt 5). Zugangsdienst, Pruefung
    # und Benachrichtigungen bleiben ohne ihre Schluessel "nicht eingerichtet".
    extra_env=(LOCATION_PROVIDER=mock LOCATION_DATA_GATE=synthetic AI_PROVIDER=mock APP_ENVIRONMENT=development)
  fi
  if pid_of functions >/dev/null; then
    info "Edge Functions laufen bereits"
    return 0
  fi
  ensure_port_free "$FUNCTIONS_PORT" "Edge Functions"
  info "Starte Edge Functions in Deno $DENO_VERSION (intern auf Port $FUNCTIONS_PORT)"
  launch functions env \
    DENO_DIR="$STATE/deno-cache" \
    DENO_NO_UPDATE_CHECK=1 \
    SUPABASE_URL="$API_URL" \
    SUPABASE_ANON_KEY="$STACK_ANON_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="$STACK_SERVICE_ROLE_KEY" \
    SUPABASE_DB_URL="$DB_URL" \
    APP_URL="$APP_URL" \
    "${extra_env[@]}" \
    "$DENO_DIR_BIN/deno" run --quiet --no-prompt --allow-net --allow-env \
    --allow-read="$ROOT" "$HERE/functions.mjs" "$FUNCTIONS_PORT"
  wait_for_http functions "http://127.0.0.1:$FUNCTIONS_PORT/"
}

start_gateway() {
  if pid_of gateway >/dev/null; then
    info "Gateway laeuft bereits"
    return 0
  fi
  ensure_port_free "$API_PORT" Gateway
  info "Starte Gateway auf Port $API_PORT"
  launch gateway env \
    STACK_API_PORT="$API_PORT" \
    STACK_AUTH_PORT="$AUTH_PORT" \
    STACK_REST_PORT="$REST_PORT" \
    STACK_FUNCTIONS_PORT="$FUNCTIONS_PORT" \
    STACK_SECRETS_FILE="$STATE/secrets.env" \
    STACK_CONFIG_TOML="$ROOT/supabase/config.toml" \
    STACK_DB_URL="$DB_URL" \
    STACK_STORAGE_DIR="$STATE/storage" \
    node "$HERE/gateway.mjs"
  wait_for_http gateway "$API_URL/cloud-stack/health"
}

load_secrets() {
  node "$HERE/env.mjs" secrets "$STATE/secrets.env"
  set -a
  # shellcheck disable=SC1091
  . "$STATE/secrets.env"
  set +a
}

# --- Befehle -----------------------------------------------------------------

start() {
  command -v node >/dev/null || fail "node fehlt."
  command -v curl >/dev/null || fail "curl fehlt."
  mkdir -p "$STATE" "$STATE/storage"
  fetch_binaries
  load_secrets
  start_postgres

  if ! bootstrapped; then
    info "Grundgeruest: Rollen und Schemas wie im Supabase-Image"
    psql_db -f "$HERE/bootstrap.sql" >>"$STATE/migrations.log" 2>&1 ||
      fail "Grundgeruest fehlgeschlagen (Log: .tmp/stack/migrations.log)."
  fi

  start_gotrue

  if [ "$(psql_db -At -c "select count(*) from pg_namespace where nspname = 'storage'")" = "0" ]; then
    psql_db -f "$HERE/storage-schema.sql" >>"$STATE/migrations.log" 2>&1 ||
      fail "Schema storage fehlgeschlagen (Log: .tmp/stack/migrations.log)."
  fi
  # Der Seed laeuft genau dann, wenn die Migrationen bei null beginnen - also
  # nach `reset` oder beim ersten Start, auch wenn der erste Versuch abbrach.
  local applied_before
  applied_before="$(psql_db -At -c 'select count(*) from supabase_migrations.schema_migrations')"
  apply_migrations
  if [ "$applied_before" = "0" ]; then seed; fi

  start_postgrest
  start_functions
  start_gateway

  node "$HERE/env.mjs" env-local "$STATE/secrets.env" "$ROOT/.env.development.local" "$API_URL"
  info ".env.development.local geschrieben (VITE_SUPABASE_*, VITE_APP_ENVIRONMENT, E2E_SUPABASE_*)"
  echo
  echo "Stack laeuft: $API_URL  (Datenbank: $DB_URL)"
  echo "Anwendung:    pnpm dev  -> $APP_URL, Testkonten mit LokalerTestzugang!2026"
  echo "E2E:          set -a; . ./.env.development.local; set +a; pnpm test:e2e --project authenticated"
}

stop() {
  halt gateway
  halt functions
  halt postgrest
  halt gotrue
  stop_postgres
}

reset() {
  stop
  info "Verwerfe .tmp/stack-pgdata und die abgelegten Dateien"
  rm -rf "$PGDATA" "$STATE/storage"
  start
}

status() {
  local name state
  for name in gotrue postgrest functions gateway; do
    if pid_of "$name" >/dev/null; then state="laeuft"; else state="-"; fi
    printf '  %-10s %s\n' "$name" "$state"
  done
  if [ -n "$PGBIN" ] && [ -d "$PGDATA" ] && run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' status" >/dev/null 2>&1; then
    printf '  %-10s %s\n' "postgres" "laeuft (Port $DB_PORT)"
    if bootstrapped; then
      printf '  %-10s %s von %s\n' "migration" \
        "$(psql_db -At -c 'select count(*) from supabase_migrations.schema_migrations')" \
        "$(find "$ROOT/supabase/migrations" -name '*.sql' | wc -l)"
    fi
  else
    printf '  %-10s %s\n' "postgres" "-"
  fi
  if curl -fsS -o /dev/null --noproxy '*' "$API_URL/cloud-stack/health" 2>/dev/null; then
    echo "API: $API_URL"
  fi
}

if [ "${2:-}" = "--reich" ]; then RICH_DATA=1; fi

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  reset) reset ;;
  status) status ;;
  *)
    echo "Verwendung: $0 {start [--reich]|stop|reset [--reich]|status}" >&2
    exit 2
    ;;
esac
