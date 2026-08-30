# Entwicklungsumgebung

Stand: 2026-08-30 · verbindlich sind `PROJECT_PRINCIPLES.md` und `docs/adr/`.

> **Es werden ausschließlich synthetische Daten verwendet.** Echte
> Patientendaten dürfen in keiner Entwicklungs-, Test- oder Demoumgebung
> auftauchen (`PROJECT_PRINCIPLES.md` §3.1). Coding- und KI-Werkzeuge erhalten
> niemals Produktionscredentials.

## Voraussetzungen

| Werkzeug          | Version | Zweck                                              |
| ----------------- | ------- | -------------------------------------------------- |
| Node.js           | ≥ 22    | Laufzeit                                           |
| pnpm              | 10.x    | Paketmanager                                       |
| PostgreSQL-Server | 16      | lokale Testdatenbank für Migrations- und RLS-Tests |
| Docker            | aktuell | Supabase-Stack: Anmeldung und echte E2E-Tests      |

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

## Vollständiger Supabase-Stack

Für Anmeldung (GoTrue), PostgREST und die echten E2E-Tests wird der lokale
Supabase-Stack benötigt. Er läuft in Docker und enthält ausschließlich
synthetische Daten.

```bash
pnpm dlx supabase start        # benötigt Docker
pnpm dlx supabase db reset     # Migrationen + Seed erneut anwenden
pnpm dlx supabase status       # URL und anon key dieser Instanz
```

Die Werte aus `supabase status` gehören zu einer **lokalen Wegwerf-Instanz**.
Sie werden bei jedem Neuaufsetzen neu erzeugt, sind kein Secret im Sinne von
`PROJECT_PRINCIPLES.md` §3.3 — und gehören trotzdem **nicht ins Repository**:
der anon key ist ein JWT und wird vom Secret-Scan zu Recht als Fund gemeldet.

## Lokale Abnahme unter Windows (Git Bash)

Ablauf für die manuelle Prüfung eines Feature-Branches. Alle Befehle laufen im
Projektverzeichnis in Git Bash.

**1. Branch aktualisieren**

```bash
git fetch origin
git checkout claude/patient-data-edit-61uj2q
git pull --ff-only origin claude/patient-data-edit-61uj2q
```

**2. Abhängigkeiten installieren**

```bash
pnpm install --frozen-lockfile
```

**3. Supabase starten** (Docker Desktop muss laufen)

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset     # Migrationen + synthetischer Seed
pnpm dlx supabase status       # API URL und anon key notieren
```

**4. `.env.local` anlegen**

```bash
cp .env.example .env.local
```

Darin einsetzen — beides aus `supabase status`:

```
VITE_SUPABASE_URL=<API URL>
VITE_SUPABASE_ANON_KEY=<anon key>
```

`.env.local` ist nicht versioniert und bleibt es auch.

**5. Anwendung starten**

```bash
pnpm dev                       # http://127.0.0.1:5173
```

Anmeldung mit einem Konto aus „Testkonten" und dem Entwicklungskennwort.

**6. Echte E2E-Tests starten** (zweites Git-Bash-Fenster)

```bash
export E2E_SUPABASE_URL=<API URL>
export E2E_SUPABASE_ANON_KEY=<anon key>
pnpm test:e2e
```

Erst wenn **beide** Variablen gesetzt sind, läuft zusätzlich das
Playwright-Projekt `authenticated` mit den Abläufen hinter der Anmeldung.
Ohne sie läuft nur die Abdeckung des nicht angemeldeten Zustands. Die Tests
ändern echte Zeilen im lokalen Stack und stellen den Seed-Zustand am Ende
wieder her.

**7. PAT-002 manuell prüfen** — Stammdaten bearbeiten

1. Als `olivia.office@praxis.invalid` anmelden.
2. „Patient:innen" → „Erika Beispiel" öffnen.
3. „Stammdaten bearbeiten" klicken.
4. Feld „Ort" ändern, „Änderungen speichern".
5. Der neue Ort steht in der Akte unter „Adresse".
6. Seite neu laden (F5) — der Wert steht weiterhin dort.
7. Als `jannes.test@praxis.invalid` (owner) anmelden und
   „Praxis → Sicherheit → Audit" öffnen: dort steht ein Eintrag
   `patient.updated`, ohne Stammdatenwerte.

**8. PAT-003 manuell prüfen** — Versorgungsstatus

Den Status dürfen `owner`, `team_lead` und `office` wechseln, `therapist`
nicht: der Wechsel nimmt eine Person aus dem laufenden Betrieb und ist damit
ein Vorgang der Praxisführung, kein Behandlungsschritt (§4.1, §4.3, §4.5).
`inactive` ist eine rein organisatorische Markierung und **kein**
Behandlungsabschluss im Sinne von ADR-008.

1. Als `olivia.office@praxis.invalid` anmelden, „Max Mustermann" öffnen.
2. „Als inaktiv markieren" klicken — es erscheint eine Rückfrage.
3. Bestätigen. Status steht auf „Inaktiv".
4. Seite neu laden — der Status bleibt „Inaktiv".
5. In der Patientenliste greift der Filter „Inaktiv".
6. „Wieder als aktiv führen" stellt den Ausgangszustand her.
7. Gegenprobe: als `anna.beispiel@praxis.invalid` (nur `therapist`) dieselbe
   Akte öffnen — die Akte ist lesbar, die Statusaktion fehlt. Das ist
   ausdrücklich **kein** Sicherheitsnachweis; verbindlich ist
   `set_patient_status`, geprüft in `pnpm test:db` und im E2E-Test
   „Autorisierung auf RPC-Ebene".

**9. Typische Fehler**

| Symptom                                                 | Ursache und Abhilfe                                                                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Port 5173 is already in use`                           | Ein `pnpm dev` läuft noch. `netstat -ano \| findstr :5173` in PowerShell, dann `taskkill /PID <pid> /F`. Der Port ist bewusst fest (`strictPort`). |
| `Konfiguration unvollständig: VITE_SUPABASE_URL fehlt.` | `.env.local` fehlt oder wurde nach dem Start von `pnpm dev` angelegt — Dev-Server neu starten.                                                     |
| `E2E_SUPABASE_URL und E2E_SUPABASE_ANON_KEY fehlen.`    | Die beiden `export`-Zeilen aus Schritt 6 gelten nur im aktuellen Fenster.                                                                          |
| Anmeldung schlägt fehl, obwohl das Kennwort stimmt      | Der Stack läuft nicht oder wurde neu aufgesetzt. `pnpm dlx supabase status` prüfen, danach `pnpm dlx supabase db reset`.                           |
| E2E-Tests finden „Erika Beispiel" nicht                 | Der Seed fehlt. `pnpm dlx supabase db reset`.                                                                                                      |
| Docker startet nicht                                    | Docker Desktop muss laufen, bevor `supabase start` aufgerufen wird.                                                                                |

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

1. **Die E2E-Abläufe hinter der Anmeldung laufen nur mit Docker.** Sie brauchen
   den lokalen Supabase-Stack und werden über `E2E_SUPABASE_URL` /
   `E2E_SUPABASE_ANON_KEY` freigeschaltet (siehe „Lokale Abnahme"). In CI
   startet der Job `e2e-supabase` den Stack selbst. In Umgebungen ohne Docker
   — etwa der Cloud-Entwicklungsumgebung — läuft weiterhin ausschließlich die
   Abdeckung des nicht angemeldeten Zustands.
2. **Die Abdeckung hinter der Anmeldung ist bewusst schmal.** Belegt sind die
   Kernflüsse von PAT-002 und PAT-003 samt Persistenz über einen Neuladevorgang
   und ein negativer Berechtigungsnachweis auf RPC-Ebene. Die Breite der
   Prüfung liegt weiterhin bei `pnpm test:db` und den Komponententests.
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
  `security`, `e2e`, `e2e-supabase`; Force Push verbieten (ADR-013).
- GitHub Secret Scanning und Push Protection aktivieren.
- Dependabot oder eine vergleichbare Aktualisierung der Abhängigkeiten.
