#!/bin/bash
# -----------------------------------------------------------------------------
# SessionStart-Hook fuer Claude Code in der Cloud-/Remote-Umgebung.
#
# Grund: In einer frischen Remote-Session fehlt node_modules. Der erste
# `pnpm format:check` scheitert dann mit einer irrefuehrenden Meldung ueber ein
# fehlendes Prettier-Plugin, und die Session verliert einen Lauf plus
# Fehlersuche daran. Der Hook nimmt das vorweg.
#
# Laeuft ausschliesslich remote. Auf einem lokalen Rechner passiert nichts —
# dort verwaltet Jannes die Abhaengigkeiten selbst.
#
# Idempotent: mehrfaches Ausfuehren ist unschaedlich.
# -----------------------------------------------------------------------------
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# --frozen-lockfile: der Lockfile ist die Quelle der Wahrheit (ADR-013).
# pnpm nutzt seinen Store, der Lauf ist damit auch beim zweiten Mal schnell.
# Kein `corepack enable` — das loest bei jedem Sessionstart einen Abruf der
# pnpm-Version aus der Registry aus. Ist pnpm nicht vorhanden, soll der Hook
# das sichtbar melden statt es still nachzuladen.
if ! command -v pnpm >/dev/null 2>&1; then
  echo "SessionStart: pnpm nicht gefunden — Abhaengigkeiten nicht installiert." >&2
  exit 1
fi

pnpm install --frozen-lockfile

# Playwright verwendet den vorinstallierten Chromium statt einen Download,
# der vom Egress-Proxy ohnehin blockiert wuerde.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -x /opt/pw-browsers/chromium ]; then
  echo 'export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium' >>"$CLAUDE_ENV_FILE"
fi

echo "SessionStart: Abhaengigkeiten installiert."
