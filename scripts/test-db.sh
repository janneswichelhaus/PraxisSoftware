#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Lokale Wegwerf-Datenbank fuer Migrations- und RLS-Tests.
#
# Startet einen eigenen PostgreSQL-Cluster unterhalb von .tmp/ auf Port 54329.
# Enthaelt ausschliesslich synthetische Daten (PROJECT_PRINCIPLES.md 3.1) und
# ist von jeder anderen Umgebung getrennt (3.2).
#
# In CI wird stattdessen der postgres-Service verwendet; beide sprechen ueber
# TEST_DATABASE_URL.
#
# PostgreSQL verweigert den Start als root. Laeuft das Skript als root und es
# existiert ein System-Benutzer `postgres`, wird der Cluster ueber `su` unter
# diesem Benutzer betrieben.
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$ROOT/.tmp/pgdata"
LOGFILE="$ROOT/.tmp/postgres.log"
PORT="${TEST_DB_PORT:-54329}"

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$PGBIN" ]; then
  echo "FEHLER: Kein lokaler PostgreSQL-Server gefunden (/usr/lib/postgresql/*/bin)." >&2
  echo "        Siehe docs/DEVELOPMENT.md fuer Alternativen." >&2
  exit 1
fi

RUN_AS=""
if [ "$(id -u)" -eq 0 ]; then
  if id postgres >/dev/null 2>&1; then
    RUN_AS="postgres"
  else
    echo "FEHLER: Als root ohne System-Benutzer 'postgres' kann kein Cluster starten." >&2
    exit 1
  fi
fi

run() {
  if [ -n "$RUN_AS" ]; then
    su "$RUN_AS" -c "$1"
  else
    bash -c "$1"
  fi
}

start() {
  mkdir -p "$ROOT/.tmp"
  if [ -n "$RUN_AS" ]; then
    chown "$RUN_AS" "$ROOT/.tmp"
    touch "$LOGFILE" && chown "$RUN_AS" "$LOGFILE"
  fi

  if [ ! -d "$PGDATA" ]; then
    echo "> initdb -> $PGDATA"
    run "'$PGBIN/initdb' -D '$PGDATA' -U postgres --auth=trust --encoding=UTF8 --locale=C" >/dev/null
  fi

  if run "'$PGBIN/pg_ctl' -D '$PGDATA' status" >/dev/null 2>&1; then
    echo "> PostgreSQL laeuft bereits"
  else
    echo "> Starte PostgreSQL auf Port $PORT"
    run "'$PGBIN/pg_ctl' -D '$PGDATA' -l '$LOGFILE' -o '-p $PORT -k $PGDATA -c listen_addresses=127.0.0.1' -w start" >/dev/null
  fi
  echo "> TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:$PORT/postgres"
}

stop() {
  if run "'$PGBIN/pg_ctl' -D '$PGDATA' status" >/dev/null 2>&1; then
    run "'$PGBIN/pg_ctl' -D '$PGDATA' -m fast -w stop" >/dev/null
    echo "> PostgreSQL gestoppt"
  else
    echo "> PostgreSQL laeuft nicht"
  fi
}

reset() {
  stop || true
  rm -rf "$PGDATA"
  start
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  reset) reset ;;
  *) echo "Verwendung: $0 {start|stop|reset}" >&2; exit 2 ;;
esac
