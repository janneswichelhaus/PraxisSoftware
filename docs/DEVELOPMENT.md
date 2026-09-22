# Entwicklungsumgebung

Stand: 2026-09-13 · verbindlich sind `PROJECT_PRINCIPLES.md` und `docs/adr/`.

> **Es werden ausschließlich synthetische Daten verwendet.** Echte
> Patientendaten dürfen in keiner Entwicklungs-, Test- oder Demoumgebung
> auftauchen (`PROJECT_PRINCIPLES.md` §3.1). Coding- und KI-Werkzeuge erhalten
> niemals Produktionscredentials. Das gilt auch für Design-Entwürfe und
> Kanvas-Dateien im Repository: Für den nächsten Entwurf dieser Art gilt —
> Namen im Muster des Seeds („Anna Beispiel", „Max Mustermann") ersparen die
> Rückfrage; sie sind als erfunden erkennbar, ohne dass jemand danach fragen
> muss.

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

Die Version steht hier und in `.github/workflows/ci.yml` — nirgends sonst;
sie wird bewusst von Hand erhöht, damit lokal und in CI derselbe Stack läuft.
Weiter unten steht `supabase` deshalb ohne Version; gemeint ist immer
`pnpm dlx supabase@2.116.0`. Lief der Stack zuvor mit einer anderen
Postgres-Hauptversion (`supabase/config.toml` verlangt `major_version = 17`),
zuerst `supabase stop --no-backup` ausführen — das verwirft die lokalen Volumes
samt synthetischer Daten; `start` legt den Stack danach neu an.

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
supabase start
supabase db reset        # Migrationen + synthetischer Seed
supabase status -o env | grep -E "^(API_URL|ANON_KEY)"
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
[`abnahme/`](abnahme/) — eine Datei je Roadmap-Etappe; welche Loops in
welcher Datei stehen, sagt die Tabelle in
[`abnahme/README.md`](abnahme/README.md).

**8. Typische Fehler**

| Symptom                                                 | Ursache und Abhilfe                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Port 5173 is already in use`                           | Ein `pnpm dev` läuft noch. `netstat -ano \| findstr :5173` in PowerShell, dann `taskkill /PID <pid> /F`. Der Port ist bewusst fest (`strictPort`).                                    |
| `Konfiguration unvollständig: VITE_SUPABASE_URL fehlt.` | `.env.local` fehlt oder wurde nach dem Start von `pnpm dev` angelegt — Dev-Server neu starten.                                                                                        |
| `E2E_SUPABASE_URL und E2E_SUPABASE_ANON_KEY fehlen.`    | Die beiden `export`-Zeilen aus Schritt 6 gelten nur im aktuellen Fenster.                                                                                                             |
| Anmeldung schlägt fehl, obwohl das Kennwort stimmt      | Der Stack läuft nicht oder wurde neu aufgesetzt. `supabase status` prüfen, danach `supabase db reset`.                                                                                |
| E2E-Tests finden „Erika Beispiel" nicht                 | Der Seed fehlt. `supabase db reset`.                                                                                                                                                  |
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
pnpm format          # dieselbe Prüfung, schreibend
pnpm lint            # ESLint inkl. statischer Sicherheitsanalyse
pnpm typecheck       # TypeScript strict
pnpm test            # Unit-/Komponententests
pnpm test:watch      # dieselben Tests, laufend
pnpm test:db         # Migrationen + RLS gegen echtes PostgreSQL
pnpm test:e2e        # Playwright
pnpm docs:check      # Obergrenzen, Register-Anker, relative Verweise, Querverweise, eindeutige Nummern
pnpm db:reset        # Test-Datenbank aus Migrationen neu aufsetzen
pnpm scan:secrets    # Secret-Scan über versionierte Dateien
pnpm build
pnpm preview         # den gebauten Stand lokal ausliefern
```

`pnpm docs:check` ist ein Gate nach ADR-013 (Prüfung 2.10) und läuft im Job
„Lint, Typecheck, Tests, Build" direkt hinter dem Lint. Es prüft drei Dinge:
die Obergrenzen von `CLAUDE.md` (150), `docs/STATUS.md` (60),
`ASSUMPTIONS.md` (800) und `OPEN_DECISIONS.md` (400); dass jede `ANN-NNN` des
Registers einen Anker in `src/`, `supabase/migrations/` oder
`.github/workflows/` hat; und dass jeder relative Markdown-Verweis auf eine
vorhandene Datei zeigt.

**Modell und Aufwand.** `.claude/settings.json` setzt Opus 5 projektweit. Einen
Aufwand je Aufgabe kennt die Datei nicht; die Regel „Migration, RLS, Policy
oder Zweitreview mit `/effort xhigh`" steht in
[`development/SESSION-START.md`](development/SESSION-START.md). In der
Weboberfläche hat die Modellwahl beim Sessionstart Vorrang — die Datei gilt für
CLI-Sessions.

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
- Der Prompt hat den Stand vor Roadmap 5.2: fünf eigene Schritte, er liest nur
  die Roadmap und `git log`. Schritt 1 (mit `docs/STATUS.md` und
  `development/ARBEITSBEREICHE.md` §2) und Schritt 6 (abgelaufene
  Sandbox-Prototypen) fehlen ihm; den neuen Prompt-Text trägt Jannes ein
  („Manuelle Schritte im Repository").
- Nach der Zeitumstellung Ende Oktober fällt sie auf 06:50 Uhr; wer 07:50
  behalten will, ändert den Cron-Ausdruck auf `50 6 * * 1`.
- Abschalten, Takt oder Prompt ändern: über die Routines-Oberfläche auf
  claude.ai oder durch eine Anweisung in einer Session.

## Go-live-Blocker

**Die Praxis eröffnet im Juli 2027 ohne Vorgängersystem — der einzige
Termin des Projekts; alles andere steht in einer Reihenfolge** (entschieden am 2026-09-05 und
2026-09-06, auf einen Termin zurückgeführt am 2026-09-21; Meilensteine, die
Kette bis zur Eröffnung und die Etappen G und H in
[`development/ROADMAP.md`](development/ROADMAP.md)).

Offene Punkte führt [`decisions/OPEN_DECISIONS.md`](decisions/OPEN_DECISIONS.md),
die Reihenfolge [`development/ROADMAP.md`](development/ROADMAP.md) (Spur B,
Etappe G). Hier steht nur, was im Code offen ist:

1. **Das Löschverfahren nach [ADR-008](adr/ADR-008-data-retention-and-deletion.md)
   steht, zwei betriebliche Teile fehlen noch.** Gebaut und getestet sind seit
   LOE-EPIC-001: der Retention Schedule als Daten
   (`public.retention_classes`/`retention_assignments`), der Anker „Abschluss
   der Versorgung", der Legal Hold, der tägliche Löschlauf
   (`public.apply_retention()`), das Löschjournal und die Wiederanwendung
   (`public.reapply_deletion_journal()`). Offen bleibt:
   - **Der Scheduler braucht `pg_cron`.** Die Migration registriert den Lauf
     nur, wenn die Erweiterung vorhanden ist; fehlt sie, wird **nicht**
     gelöscht. In der Wegwerf-Datenbank der Tests ist das so gewollt (die Tests
     rufen die Funktion direkt auf); im Produktivprojekt muss die Registrierung
     nachweislich stehen (OPS-001, ANN-007).
   - **Das Restore-Verfahren muss das Journal sichern.** Es liegt in derselben
     Datenbank und wird von einem Restore mit zurückgesetzt. OPS-003 muss es
     vor der Rückspielung exportieren, danach einspielen und erst dann
     `reapply_deletion_journal()` aufrufen (ADR-008 Punkt 8, ADR-012, ANN-031).
     Keine Funktion kann das lösen.

**Außerhalb des Codes** blockieren den Produktivstart die Providerprüfungen
(Supabase nach [ADR-002](adr/ADR-002-hosting-data-residency.md), Kartendienst
nach [ADR-019](adr/ADR-019-map-service.md) Punkt 9), der Datenschutzprozess
nach [ADR-007](adr/ADR-007-data-protection-impact-assessment.md) Punkt 5, die
Prüfung der Zweckbestimmung nach [ADR-006](adr/ADR-006-medical-device-boundary.md)
und die Bestätigung aller Datenschutz- und Rechtsannahmen im
[Annahmenregister](decisions/ASSUMPTIONS.md) — Stand in `OPEN_DECISIONS.md`,
Eingeordnet in der Roadmap (M3, G18).

## Audit

Gelesen wird das Auditlog nur über `list_audit_events` (Regeln: ADR-010
Fassung 2, Punkt 13).

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

In der Akte gilt dasselbe Muster (DOK-003, ROL-001):
`list_patient_treatment_notes` liefert allen vier Praxisrollen — seit E15 auch
`office` — die Einträge aller Termine eines Patienten und protokolliert **je
Eintrag** `treatment_note.viewed`; das Öffnen der Akte steht zusätzlich als
`patient_record.viewed`. Der Behandlungsnachweis
`list_patient_treatment_evidence` bleibt als Rechnungssicht ohne klinischen
Inhalt und ohne eigenen Auditeintrag bestehen (ADR-004 Fassung 2 Punkt 4); die
Akte fragt ihn nicht mehr an. Beide Sichten blättern über dieselbe Seitenregel
`app.patient_record_page` mit höchstens 50 Terminen je Aufruf. Verordnung mit
Diagnose (`prescription.viewed`) und klinische Dateien
(`patient_file.link_issued`) liest `office` seit ROL-002 ebenso; die
Schreibrechte sind unverändert.

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
   startet der Job „End-to-End hinter der Anmeldung" (`e2e-supabase`) den
   Stack selbst. In Umgebungen ohne Docker
   — etwa der Cloud-Entwicklungsumgebung — läuft weiterhin ausschließlich die
   Abdeckung des nicht angemeldeten Zustands.
2. **Hinter der Anmeldung** laufen 19 Spezifikationen im Playwright-Projekt
   `authenticated`; die Breite der Prüfung liegt bei `pnpm test:db`.
3. **Der Secret-Scan prüft nur den aktuellen Stand**, nicht die Git-Historie.
   GitHub Secret Scanning und Push Protection sollten zusätzlich in den
   Repository-Einstellungen aktiviert werden.
4. **Die statische Sicherheitsanalyse ist `eslint-plugin-security`** — sinnvoll
   für JavaScript/TypeScript, aber kein vollwertiges SAST. Eine Erweiterung ist
   offen.
5. **Kein Offline-Modus und kein Service Worker** (ADR-015, ADR-001).
6. **Abgewiesene Zugriffe werden nur auf zwei Pfaden persistiert.** Eine
   Abweisung per Ausnahme rollt die Transaktion und damit auch ihren
   Protokolleintrag zurück. `list_audit_events` und `list_deletion_runs`
   weisen deshalb seit OPS-004 mit null Zeilen ab und schreiben
   `outcome = 'denied'`; alle übrigen Abweisungen bleiben ohne Eintrag
   (ROADMAP G6a).
7. **Kein monatlicher Audit-Report** (ADR-010 führt ihn als SOLLTE) und keine
   Auswertung oder Alarmierung.
8. **Die Dateiablage ist gebaut, aber nicht produktiv** — vor der ersten
   echten Datei OPS-001 und ein getesteter Sicherungsweg für den
   Objektspeicher ([ADR-017](adr/ADR-017-file-storage.md), OPS-003).
9. **Die automatische Finalisierung braucht `pg_cron`** wie der Löschlauf
   (ADR-016 Punkt 7, ANN-007); ob der Job läuft, zeigt
   `select jobname, schedule from cron.job;`.
10. **Ein Termin mit Dokumentation lässt sich weiterhin absagen.** Ob das
    fachlich zulässig sein soll, ist offen; der Entwurf bleibt in diesem Fall
    erhalten und lesbar, es geht nichts verloren.
11. **Der Behandlungsnachweis enthält keine „erbrachte Leistung"** — sie kommt
    mit ABR-002 (`PROJECT_PRINCIPLES.md` §4.4, Punkt C1). Seit ROL-001 steht er
    nicht mehr in der Akte, sondern nur noch als Rechnungssicht auf dem Server.

## Manuelle Schritte im Repository

Diese Einstellungen lassen sich nicht aus dem Code setzen:

- Branch Protection auf `main` (M0): erforderliche Checks unter ihren
  Anzeigenamen „Lint, Typecheck, Tests, Build" (`quality`), „Migrationen und
  RLS-Policies" (`database`), „Secret Scanning und Dependency Audit"
  (`security`), „End-to-End" (`e2e`), „End-to-End hinter der Anmeldung"
  (`e2e-supabase`); Force Push und Deletions aus; keine Pflicht-Approvals
  (ADR-013).
- GitHub Secret Scanning und Push Protection aktivieren.
- Gemergte Branches automatisch löschen („Automatically delete head
  branches"). „Allow auto-merge" entfällt — auf diesem GitHub-Plan nicht
  verfügbar; Jannes mergt nach grüner CI (Roadmap, „Definition of Done").
- Nach dem Merge der Konsolidierung R2: Pull Request #37 schließen, nicht
  mergen (sein Inhalt steht als `development/VER-EPIC-002.md` auf `main`), dann
  `git fetch origin --prune && git push origin --delete claude/focused-hopper-mwkc5d claude/praxissoftware-arch-graph-gc1a3u codex/plan-verordnung-office-20260913`.
- Wochenupdate-Routine (`trig_01N5FanspQGxJP9S9rnZiZHj`) auf claude.ai: den
  Prompt ersetzen durch

  ```
  Wochenupdate für PraxisSoftware auf main. Nichts bauen, nichts ändern.
  Den Abschnitt „Wochenupdate" in docs/development/ROADMAP.md Schritt für
  Schritt ausführen und im dort festgelegten Format antworten.
  ```

  Weil er nur auf den Abschnitt verweist, folgt die Routine jeder künftigen
  Änderung dort ohne neuen Eingriff.

- Dependabot oder eine vergleichbare Aktualisierung der Abhängigkeiten.
- **Die Supabase-CLI-Version in `.github/workflows/ci.yml` von Hand erhöhen.**
  Sie steht dort fest statt auf `latest`, weil `latest` die Action bei jedem
  Lauf die GitHub-API nach dem neuesten Release fragen lässt — ein Aufruf ohne
  Token, der am 2026-09-05 ins Rate Limit lief und den `main`-Lauf umbrachte,
  bevor ein einziger Test lief. Eine feste Version macht das Gate zusätzlich
  reproduzierbar (ADR-013). Die aktuelle Version steht auf
  <https://www.npmjs.com/package/supabase>.
