# Entwicklungsumgebung

Stand: 2026-09-05 · verbindlich sind `PROJECT_PRINCIPLES.md` und `docs/adr/`.

> **Es werden ausschließlich synthetische Daten verwendet.** Echte
> Patientendaten dürfen in keiner Entwicklungs-, Test- oder Demoumgebung
> auftauchen (`PROJECT_PRINCIPLES.md` §3.1). Coding- und KI-Werkzeuge erhalten
> niemals Produktionscredentials.

## Voraussetzungen

| Werkzeug          | Version | Zweck                                                                            |
| ----------------- | ------- | -------------------------------------------------------------------------------- |
| Node.js           | ≥ 22    | Laufzeit                                                                         |
| pnpm              | 10.x    | Paketmanager                                                                     |
| PostgreSQL-Server | 16      | lokale Testdatenbank für Migrations- und RLS-Tests (Linux oder WSL, siehe unten) |
| Docker            | aktuell | Supabase-Stack: Anmeldung und echte E2E-Tests                                    |

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

`scripts/test-db.sh` sucht den Server ausschließlich unter
`/usr/lib/postgresql/*/bin` — also auf Linux beziehungsweise in WSL. Unter
Windows (Git Bash) läuft `pnpm db:start` deshalb nicht; dort bleibt
`pnpm test:db` dem CI-Job `database` und der Cloud-Entwicklungsumgebung
überlassen, oder es wird in WSL ausgeführt. **Niemals** `TEST_DATABASE_URL`
auf die Datenbank des Supabase-Stacks (Port 54322) richten: der Testlauf
löscht die Schemata `auth` und `extensions` und zerstört damit den lokalen
Stack.

## Vollständiger Supabase-Stack

Für Anmeldung (GoTrue), PostgREST und die echten E2E-Tests wird der lokale
Supabase-Stack benötigt. Er läuft in Docker und enthält ausschließlich
synthetische Daten.

```bash
pnpm dlx supabase@2.116.0 start           # benötigt Docker
pnpm dlx supabase@2.116.0 db reset        # Migrationen + Seed erneut anwenden
pnpm dlx supabase@2.116.0 status -o env   # API_URL und ANON_KEY dieser Instanz
```

Die CLI-Version sollte der in `.github/workflows/ci.yml` festgeschriebenen
entsprechen (`pnpm dlx supabase@2.116.0 …`), damit lokal und in CI derselbe
Stack läuft. Lief der Stack zuvor mit einer anderen Postgres-Hauptversion
(`supabase/config.toml` verlangt `major_version = 17`), zuerst
`pnpm dlx supabase@2.116.0 stop --no-backup` ausführen — das verwirft die
lokalen Volumes samt synthetischer Daten; `start` legt den Stack danach neu
an.

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
git checkout <feature-branch>
git pull --ff-only origin <feature-branch>
```

**2. Abhängigkeiten installieren**

```bash
pnpm install --frozen-lockfile
```

**3. Supabase starten** (Docker Desktop muss laufen)

```bash
pnpm dlx supabase@2.116.0 start
pnpm dlx supabase@2.116.0 db reset        # Migrationen + synthetischer Seed
pnpm dlx supabase@2.116.0 status -o env | grep -E "^(API_URL|ANON_KEY)"
```

**4. `.env.local` anlegen**

```bash
cp .env.example .env.local
```

Darin einsetzen — `API_URL` und `ANON_KEY` aus `supabase status -o env`. Die
lesbare Ausgabe von `supabase status` zeigt seit CLI 2.116 nur noch die neuen
Schlüssel `sb_publishable_…` und `sb_secret_…`; der Secret-Schlüssel gehört
nirgendwohin, auch nicht in `.env.local`.

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

**7. Featurebezogene Prüfschritte**

Die manuellen Klickwege je Feature stehen in
[`abnahme/`](abnahme/) — eine Datei je Roadmap-Etappe. Für den heutigen Stand:
[Patientenverwaltung und Termine](abnahme/etappe-0-patienten-und-termine.md)
(PAT-002, PAT-003, CAL-001 bis CAL-006, STAFF-001) und
[Behandlungsdokumentation](abnahme/etappe-1-kernprozess.md) (DOK-001 bis
DOK-004).

Sie liegen dort statt hier, weil sie mit jedem Loop wachsen und diese Datei
sonst unlesbar würde.

**8. Typische Fehler**

| Symptom                                                 | Ursache und Abhilfe                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Port 5173 is already in use`                           | Ein `pnpm dev` läuft noch. `netstat -ano \| findstr :5173` in PowerShell, dann `taskkill /PID <pid> /F`. Der Port ist bewusst fest (`strictPort`).                                    |
| `Konfiguration unvollständig: VITE_SUPABASE_URL fehlt.` | `.env.local` fehlt oder wurde nach dem Start von `pnpm dev` angelegt — Dev-Server neu starten.                                                                                        |
| `E2E_SUPABASE_URL und E2E_SUPABASE_ANON_KEY fehlen.`    | Die beiden `export`-Zeilen aus Schritt 6 gelten nur im aktuellen Fenster.                                                                                                             |
| Anmeldung schlägt fehl, obwohl das Kennwort stimmt      | Der Stack läuft nicht oder wurde neu aufgesetzt. `pnpm dlx supabase status` prüfen, danach `pnpm dlx supabase db reset`.                                                              |
| E2E-Tests finden „Erika Beispiel" nicht                 | Der Seed fehlt. `pnpm dlx supabase db reset`.                                                                                                                                         |
| Docker startet nicht                                    | Docker Desktop muss laufen, bevor `supabase start` aufgerufen wird.                                                                                                                   |
| `WARN: config section [inbucket] is deprecated`         | Warnung, kein Fehler. Die Umbenennung nach `[local_smtp]` in `supabase/config.toml` steht als kleine Wartung in der Roadmap; sie ist lokal mit `supabase stop` und `start` zu prüfen. |

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
pnpm format:check    # Prettier - eigenes CI-Gate, nicht Teil von lint
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

## Wochenroutine

Seit 2026-09-01 läuft montags um 07:50 Uhr (UTC 05:50, Cron `50 5 * * 1`)
eine automatische Planungssession mit dem Auftrag aus
[`development/ROADMAP.md`](development/ROADMAP.md), Abschnitt „Wochenupdate".
Sie baut nichts; das Ergebnis kommt per Push-Nachricht und E-Mail.

- Trigger-ID `trig_01N5FanspQGxJP9S9rnZiZHj`, Modell Haiku 4.5, erste
  Ausführung 2026-09-07. Sie liest `main`.
- Prompt am 2026-09-06 auf das Format der Roadmap 2.1 umgestellt
  (Entscheidung E-10): `git log --since='8 days ago'`, Fortschritt mit
  Abnahme-Spalte, Spur B mit Stand, Ampel je Meilenstein M0 bis M6.
- Nach der Zeitumstellung Ende Oktober fällt sie auf 06:50 Uhr; wer 07:50
  behalten will, ändert den Cron-Ausdruck auf `50 6 * * 1`.
- Abschalten, Takt oder Prompt ändern: über die Routines-Oberfläche auf
  claude.ai oder durch eine Anweisung in einer Session.

## Go-live-Blocker

**Die Software ist bis Ende März 2027 produktionsreif; die Praxis eröffnet
am 01.07.2027 ohne Vorgängersystem** (entschieden am 2026-09-05 und
2026-09-06; Meilensteine, Rückwärtsplan und Etappen G und H in
[`development/ROADMAP.md`](development/ROADMAP.md)).

**Die maßgebliche Liste offener Punkte ist
[`decisions/OPEN_DECISIONS.md`](decisions/OPEN_DECISIONS.md), die anstehende
Reihenfolge steht in [`development/ROADMAP.md`](development/ROADMAP.md)
(„Spur B").** Hier steht nur, was davon **den Entwicklungsstand dieses
Repositories** betrifft — damit nicht zwei Listen nebeneinander veralten.

**Technisch offen im Code:**

1. **Retention und Löschung nach [ADR-008](adr/ADR-008-data-retention-and-deletion.md)
   sind dokumentiert, aber nicht implementiert.** Es gibt keinen Löschvorgang,
   keinen Legal Hold und keine Wiederanwendung wirksamer Löschungen nach einem
   Restore. Die Datenklassen stehen als `COMMENT` an den Tabellen. ADR-008 muss
   vor Produktivstart technisch umgesetzt **und getestet** sein. In der Roadmap
   sind das die Loops LOE-001 und LOE-002.

**Ausserhalb des Codes zu erbringen** — Einzelheiten und Stand jeweils in
`OPEN_DECISIONS.md`, hier nur als Erinnerung, dass sie den Produktivstart
blockieren:

2. Providerprüfung für Supabase nach [ADR-002](adr/ADR-002-hosting-data-residency.md)
   — ohne dokumentiertes Ergebnis darf kein Cloudprojekt mit personenbezogenen
   Daten entstehen ([ADR-015](adr/ADR-015-initial-technical-stack.md)).
3. Datenschutzprozess nach [ADR-007](adr/ADR-007-data-protection-impact-assessment.md)
   inklusive der sieben dort genannten Vorbedingungen (Punkt B2).
4. Regulatorische Prüfung der Zweckbestimmung nach
   [ADR-006](adr/ADR-006-medical-device-boundary.md) (Punkt B1).
5. Alle Annahmen der Kategorien Datenschutz und Recht im
   [Annahmenregister](decisions/ASSUMPTIONS.md) sind von der Prüfung bestätigt
   oder geändert umgesetzt; kein Eintrag dieser Kategorien steht mehr auf
   `offen` **oder `entschieden (Jannes)`** (`PROJECT_PRINCIPLES.md` §15.1
   Punkt 5 verlangt dort den Datenschutzprozess nach §3.7, nicht die
   Festlegung des Projektinhabers). Dasselbe gilt für die Punkte in
   [`decisions/OPEN_DECISIONS.md`](decisions/OPEN_DECISIONS.md), die auf
   `vorläufig entschieden (Jannes)` stehen.

## Audit

Das Auditlog hat **kein** direktes `SELECT`-Recht. Gelesen wird ausschließlich
über `list_audit_events` — nur für die Rolle `owner`, strikt auf die eigene
Organisation begrenzt, mit Pagination und Filtern nach Zeitraum, Benutzer und
Aktion. Die Spalte `context` wird grundsätzlich nicht herausgegeben. Jeder
Aufruf wird selbst als `audit_log.read` protokolliert.

Geschrieben werden Auditeinträge ausschließlich innerhalb der jeweiligen
Fachfunktion — `log_patient_record_view` für das Öffnen einer Akte, die
Termin- und Arbeitszeitfunktionen für ihre Vorgänge. Alle laufen als
`SECURITY DEFINER` mit leerem `search_path` und prüfen Rolle und Organisation
selbst, weil sie RLS umgehen.

Für die Behandlungsdokumentation gilt zusätzlich: `public.treatment_notes` und
`public.treatment_note_versions` haben **kein** `SELECT`-Recht und keine Policy.
Gelesen wird ausschließlich über `get_treatment_note` und
`get_treatment_note_versions`, und beide Funktionen schreiben ihren Eintrag —
`treatment_note.viewed` beziehungsweise `treatment_note.history_viewed` — in
derselben Transaktion. Damit gibt es keinen Weg, klinischen Freitext ohne
Protokolleintrag zu lesen (ADR-010). Die Begründung einer Korrektur zählt dabei
wie Inhalt: sie steht in der Versionstabelle, niemals im Auditlog.

In der Akte gilt dasselbe Muster (DOK-003): `list_patient_treatment_notes`
liefert den klinischen Rollen die Einträge aller Termine eines Patienten und
protokolliert **je Eintrag** `treatment_note.viewed`; die Verwaltung bekommt
über `list_patient_treatment_evidence` den Behandlungsnachweis ohne klinischen
Inhalt und ohne eigenen Auditeintrag — das Öffnen der Akte steht als
`patient_record.viewed` (ANN-006). Beide Sichten blättern über dieselbe
Seitenregel `app.patient_record_page` mit höchstens 50 Terminen je Aufruf.

Seit DOK-004 kennt das Auditlog einen **Systemakteur**: Ereignisse eines
zeitgesteuerten Vorgangs — heute die automatische Finalisierung — tragen
`actor_kind = 'system'` und keinen Account; die Auditansicht zeigt sie als
„System", der Benutzerfilter blendet sie aus (ANN-009).

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
8. **Keine Anhänge zur Behandlungsdokumentation.** Dateiablage ist als Punkt E8
   in `docs/decisions/OPEN_DECISIONS.md` offen (Ablageort, Zugriffsregeln,
   signierte URLs, Retention nach ADR-008); ADR-015 führt dieselbe Frage als
   offene Folgefrage. Vor einer Umsetzung braucht es dafür einen ADR. Das
   Datenmodell verbaut sie nicht: eine Anhangstabelle kommt additiv hinzu.
9. **Die automatische Finalisierung braucht `pg_cron`.** ADR-016 Punkt 7 ist
   mit DOK-004 umgesetzt: `finalize_overdue_treatment_notes` schreibt
   überfällige Entwürfe fest, und die Migration registriert den Aufruf alle
   15 Minuten über `pg_cron` — aber nur, wo die Erweiterung verfügbar ist
   (ANN-007). Der lokale Supabase-Stack bringt sie mit; die Wegwerf-Datenbank
   von `pnpm test:db` nicht, dort wird die Funktion direkt geprüft. Ob der Job
   läuft, zeigt `select jobname, schedule from cron.job;`. Auf einem Server
   ohne `pg_cron` bleibt ein Entwurf Entwurf — vor dem Produktivstart ist die
   Registrierung deshalb zu prüfen.
10. **Ein Termin mit Dokumentation lässt sich weiterhin absagen.** Ob das
    fachlich zulässig sein soll, ist offen; der Entwurf bleibt in diesem Fall
    erhalten und lesbar, es geht nichts verloren.
11. **Der Behandlungsnachweis in der Akte enthält keine „erbrachte Leistung".**
    §4.4 nennt sie, aber es gibt noch keine Leistungserfassung. Dass
    Leistungskürzel organisatorisch sind und dem Office offenstehen, ist seit
    dem 2026-09-05 mit Punkt C1 entschieden (`PROJECT_PRINCIPLES.md` §4.4,
    Version 0.4); geliefert werden können sie erst mit ABR-002. Umfang und
    Protokollierung des Nachweises bleiben als ANN-006 offen. Der fallbezogene,
    zeitlich begrenzte Office-Zugriff auf vollständige Dokumentation (§4.4
    Absatz 3) ist ebenfalls nicht gebaut.

## Manuelle Schritte im Repository

Diese Einstellungen lassen sich nicht aus dem Code setzen:

- Branch Protection auf `main`: erforderliche Checks `quality`, `database`,
  `security`, `e2e`, `e2e-supabase`; Force Push verbieten (ADR-013).
- GitHub Secret Scanning und Push Protection aktivieren.
- Dependabot oder eine vergleichbare Aktualisierung der Abhängigkeiten.
- **Die Supabase-CLI-Version in `.github/workflows/ci.yml` von Hand erhöhen.**
  Sie steht dort fest statt auf `latest`, weil `latest` die Action bei jedem
  Lauf die GitHub-API nach dem neuesten Release fragen lässt — ein Aufruf ohne
  Token, der am 2026-09-05 ins Rate Limit lief und den `main`-Lauf umbrachte,
  bevor ein einziger Test lief. Eine feste Version macht das Gate zusätzlich
  reproduzierbar (ADR-013). Die aktuelle Version steht auf
  <https://www.npmjs.com/package/supabase>.
