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

## Go-live-Blocker

Diese Punkte **müssen** vor einem Produktivbetrieb mit realen Daten erledigt
sein. Sie sind bewusst nicht Teil des aktuellen Stands.

1. **Retention und Löschung nach [ADR-008](adr/ADR-008-data-retention-and-deletion.md)
   sind dokumentiert, aber nicht implementiert.** Es gibt keinen Löschvorgang,
   keinen Legal Hold und keine Wiederanwendung wirksamer Löschungen nach einem
   Restore. Die Datenklassen stehen als `COMMENT` an den Tabellen. ADR-008 muss
   vor Produktivstart technisch umgesetzt **und getestet** sein.
2. **Providerprüfung für Supabase nach [ADR-002](adr/ADR-002-hosting-data-residency.md)**
   — ohne dokumentiertes Ergebnis darf kein Cloudprojekt mit personenbezogenen
   Daten entstehen ([ADR-015](adr/ADR-015-initial-technical-stack.md)).
3. **Datenschutzprozess nach [ADR-007](adr/ADR-007-data-protection-impact-assessment.md)**
   inklusive der sieben dort genannten Vorbedingungen.
4. **Regulatorische Prüfung der Zweckbestimmung nach
   [ADR-006](adr/ADR-006-medical-device-boundary.md).**

## Audit

Das Auditlog hat **kein** direktes `SELECT`-Recht. Gelesen wird ausschließlich
über `list_audit_events` — nur für die Rolle `owner`, strikt auf die eigene
Organisation begrenzt, mit Pagination und Filtern nach Zeitraum, Benutzer und
Aktion. Die Spalte `context` wird grundsätzlich nicht herausgegeben. Jeder
Aufruf wird selbst als `audit_log.read` protokolliert.

Geschrieben wird ausschließlich über `log_patient_record_view`. Beide Funktionen
laufen als `SECURITY DEFINER` mit leerem `search_path` und prüfen Rolle und
Organisation selbst, weil sie RLS umgehen.

Der Ereigniskatalog steht doppelt: als Check-Constraint auf `audit_log.action`
und in `src/features/audit/actions.ts`. Ein Datenbanktest hält beide
deckungsgleich.

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
6. **Abgewiesene Zugriffe werden nicht persistiert.** Die Audit-Schreibfunktion
   bricht mit einer Ausnahme ab, wodurch die Transaktion und damit auch ein
   Protokolleintrag zurückgerollt würden. Die Spalte `outcome` existiert und
   trägt derzeit ausschließlich `success`. Für die Erfassung abgewiesener
   Versuche wäre eine autonome Transaktion nötig — offen.
7. **Kein monatlicher Audit-Report** (ADR-010 führt ihn als SOLLTE) und keine
   Auswertung oder Alarmierung.

## Manuelle Schritte im Repository

Diese Einstellungen lassen sich nicht aus dem Code setzen:

- Branch Protection auf `main`: erforderliche Checks `quality`, `database`,
  `security`, `e2e`; Force Push verbieten (ADR-013).
- GitHub Secret Scanning und Push Protection aktivieren.
- Dependabot oder eine vergleichbare Aktualisierung der Abhängigkeiten.
