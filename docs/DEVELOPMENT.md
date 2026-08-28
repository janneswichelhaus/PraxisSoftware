# Entwicklungsumgebung

Stand: 2026-08-28 · verbindlich sind `PROJECT_PRINCIPLES.md` und `docs/adr/`.

> **Es werden ausschließlich synthetische Daten verwendet.** Echte
> Patientendaten dürfen in keiner Entwicklungs-, Test- oder Demoumgebung
> auftauchen (`PROJECT_PRINCIPLES.md` §3.1). Coding- und KI-Werkzeuge erhalten
> niemals Produktionscredentials.

## Voraussetzungen

| Werkzeug          | Version | Zweck                                               |
| ----------------- | ------- | --------------------------------------------------- |
| Node.js           | ≥ 22    | Laufzeit                                            |
| pnpm              | 10.x    | Paketmanager                                        |
| PostgreSQL-Server | 16      | lokale Testdatenbank für Migrations- und RLS-Tests  |
| Docker            | aktuell | nur für den vollständigen Supabase-Stack (optional) |

## Erste Schritte

```bash
pnpm install
cp .env.example .env.local     # Platzhalter durch lokale Werte ersetzen
pnpm dev
```

## Datenbank- und RLS-Tests

Die Berechtigungstests laufen gegen eine **echte** PostgreSQL-Instanz. Ein Mock
wäre wertlos, weil genau die Policy geprüft wird.

```bash
pnpm db:start                  # lokaler Cluster auf Port 54329 unter .tmp/
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres
pnpm test:db
pnpm db:stop
```

`supabase/tests/helpers/supabase-shim.sql` stellt dabei nach, was die
Migrationen von Supabase erwarten: die Rollen `anon`/`authenticated`, das Schema
`auth` und `auth.uid()`. Damit sind die Policies ohne den vollständigen
Supabase-Stack prüfbar — dieselbe Datei wird niemals gegen eine echte
Supabase-Instanz eingespielt.

Der Stand ist jederzeit aus **Migrationen + Seed** reproduzierbar. Es gibt
keinen manuell gepflegten Zwischenzustand.

## Vollständiger Supabase-Stack (optional)

Für Anmeldung, Storage und Realtime wird der Supabase-Stack benötigt:

```bash
pnpm dlx supabase start        # benötigt Docker
pnpm dlx supabase db reset     # Migrationen + Seed
```

## Testkonten

Alle Konten verwenden das Entwicklungskennwort `LokalerTestzugang!2026`. Das ist
kein Secret, sondern ein Platzhalter für eine lokale Wegwerf-Datenbank.

| E-Mail                           | Rollen               |
| -------------------------------- | -------------------- |
| `jannes.test@praxis.invalid`     | owner, therapist     |
| `anna.beispiel@praxis.invalid`   | therapist            |
| `tim.teamleitung@praxis.invalid` | therapist, team_lead |
| `olivia.office@praxis.invalid`   | office               |
| `max.mustermann@patient.invalid` | patient              |
| `erika.beispiel@patient.invalid` | patient              |

## Befehle

```bash
pnpm lint            # ESLint inkl. statischer Sicherheitsanalyse
pnpm typecheck       # TypeScript strict
pnpm test            # Unit-/Komponententests
pnpm test:db         # Migrationen + RLS gegen echtes PostgreSQL
pnpm test:e2e        # Playwright
pnpm scan:secrets    # Secret-Scan über versionierte Dateien
pnpm build
```

Steht ein Chromium bereits im System, kann er ohne Download verwendet werden:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/pfad/zu/chromium
```

## Bekannte Einschränkungen

1. **E2E-Abläufe hinter der Anmeldung sind nicht automatisiert.** Sie benötigen
   einen laufenden Supabase-Stack (GoTrue). Abgedeckt ist derzeit der nicht
   angemeldete Zustand einschließlich der Prüfung, dass ohne Anmeldung keine
   Patientendaten gerendert werden.
2. **`supabase db reset` ist in dieser Umgebung nicht erprobt**, weil die
   Container-Images nicht bezogen werden konnten. Die Migrationen sind
   stattdessen gegen PostgreSQL 16 mit dem Shim geprüft.
3. **Der Secret-Scan prüft nur den aktuellen Stand**, nicht die Git-Historie.
   GitHub Secret Scanning und Push Protection sollten zusätzlich in den
   Repository-Einstellungen aktiviert werden.
4. **Die statische Sicherheitsanalyse ist `eslint-plugin-security`** — sinnvoll
   für JavaScript/TypeScript, aber kein vollwertiges SAST. Eine Erweiterung ist
   offen.
5. **Kein Offline-Modus und kein Service Worker** (ADR-015, ADR-001).

## Manuelle Schritte im Repository

Diese Einstellungen lassen sich nicht aus dem Code setzen:

- Branch Protection auf `main`: erforderliche Checks `quality`, `database`,
  `security`, `e2e`; Force Push verbieten (ADR-013).
- GitHub Secret Scanning und Push Protection aktivieren.
- Dependabot oder eine vergleichbare Aktualisierung der Abhängigkeiten.
