#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Secret-Scan (PROJECT_PRINCIPLES.md 3.3, ADR-013)
#
# Prueft die im Repository VERSIONIERTEN Dateien auf offensichtliches
# Schluesselmaterial. Bewusst deterministisch und ohne externe Abhaengigkeit,
# damit der Check in jeder Umgebung identisch laeuft.
#
# Grenzen (siehe docs/DEVELOPMENT.md): Dies ersetzt keine
# Historien-Analyse. GitHub Secret Scanning und Push Protection sollten
# zusaetzlich in den Repository-Einstellungen aktiviert werden.
# -----------------------------------------------------------------------------
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail=0
report() { echo "FUND: $1" >&2; fail=1; }

# 1. Keine .env-Datei ausser .env.example darf versioniert sein.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  [ "$file" = ".env.example" ] && continue
  report "versionierte Umgebungsdatei: $file"
done < <(git ls-files | grep -E '(^|/)\.env($|\.)' || true)

# 2. Privates Schluesselmaterial.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  report "privater Schluessel: $file"
done < <(git ls-files | grep -E '\.(pem|key|p12|pfx|jks)$' || true)

# 3. Inhaltsmuster in versionierten Textdateien.
#    scripts/scan-secrets.sh selbst ist ausgenommen - hier stehen die Muster.
patterns=(
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'service_role[[:space:]]*[:=][[:space:]]*['"'"'"][A-Za-z0-9._-]{20,}'
  'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
  'AKIA[0-9A-Z]{16}'
  'gh[pousr]_[A-Za-z0-9]{36,}'
  'sk-[A-Za-z0-9]{32,}'
)
for pattern in "${patterns[@]}"; do
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    report "Muster '$pattern' in $hit"
  done < <(git grep -I -l -E "$pattern" -- . ':!scripts/scan-secrets.sh' 2>/dev/null || true)
done

if [ "$fail" -eq 0 ]; then
  echo "Secret-Scan: keine Funde in versionierten Dateien."
else
  echo "Secret-Scan: FEHLGESCHLAGEN." >&2
fi
exit "$fail"
