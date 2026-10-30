# Entwicklungsumgebung

Stand 2026-10-27 · Werkzeug, Befehle, Umgebungen; verbindlich sind `PROJECT_PRINCIPLES.md` und
`docs/adr/`.

> **Nur synthetische Daten**, in jeder Entwicklungs-, Test- und Demoumgebung und in Design-Entwürfen
> (`PROJECT_PRINCIPLES.md` §3.1); Namen im Muster des Seeds („Anna Beispiel“, „Max Mustermann“) sind
> als erfunden erkennbar. Coding- und KI-Werkzeuge erhalten nie Produktionscredentials.

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

Die RLS-Tests laufen gegen ein **echtes** PostgreSQL, weil genau die Policy geprüft wird:

```bash
pnpm db:start                  # lokaler Cluster auf Port 54329 unter .tmp/
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres
pnpm test:db
pnpm db:stop
```

`supabase/tests/helpers/supabase-shim.sql` stellt nach, was die Migrationen von Supabase erwarten
(Rollen `anon`/`authenticated`, Schema `auth`, `auth.uid()`), samt der Rechte, die Supabase in
`public` vergibt; ein vergessener Entzug fällt so auf (`rechte-api-rollen.test.ts`). Gegen eine
echte Supabase-Instanz läuft die Datei nie. Eine neue Funktion führt ohne ausdrückliches `grant`
keine dieser Rollen aus. Der Stand entsteht jederzeit aus Migrationen und Seed.

**Basis.** `supabase/migrations/` beginnt mit `20261225000000_basis.sql`, dem Abzug der 341
Migrationen davor (`node scripts/basis-migration.mjs schreiben`, nie von Hand geändert); neue
kommen dahinter. `pnpm db:vergleich <ref>` vergleicht Schema, Rechte und Daten des Stands `<ref>`
mit dem Arbeitsbaum, je ohne und mit den Vorgaben von Supabase. Alte Migrationen:
`git show aabe5d0:<pfad>`; eine lokale Datenbank von vorher braucht einmal einen Reset.

**CI:** `pnpm test:db` läuft in vier Teilen (`--shard=<n>/4`), die E2E-Tests hinter der Anmeldung
auch (ANN-571); die Pflichtchecks sind nur grün, wenn alle Teile es sind
(`src/werkzeugkette.test.ts`). **Nur Doku:** Ändert ein Pull Request nur Markdown unter `docs/` oder
im Wurzelverzeichnis, entfallen Lint, Typecheck, Tests, Build, Datenbank- und E2E-Prüfungen, Prettier
prüft nur die geänderten Dateien (ADR-013 Punkt 2, `scripts/nur-doku.mjs` in der Fassung des
Zielbranchs); Markdown aus `VON_TESTS_GELESEN` und jede gelöschte Datei lösen alles aus, auf `main`
läuft nach dem Merge alles.

`scripts/test-db.sh` sucht den Server nur unter `/usr/lib/postgresql/*/bin` (Linux, WSL). **Niemals**
`TEST_DATABASE_URL` auf einen Supabase-Stack richten (54322, 54339): Der Testlauf löscht die Schemata
`auth` und `extensions`.

## Vollständiger Supabase-Stack

Für Anmeldung (GoTrue), PostgREST und die echten E2E-Tests, in Docker, nur synthetische Daten:

```bash
pnpm dlx supabase@2.116.0 start           # benötigt Docker
pnpm dlx supabase@2.116.0 db reset        # Migrationen + Seed erneut anwenden
pnpm dlx supabase@2.116.0 status -o env   # API_URL und ANON_KEY dieser Instanz
```

Die Version steht hier und in `.github/workflows/ci.yml`, nirgends sonst (unten kurz `supabase`).
Bei anderer Postgres-Hauptversion (`config.toml` verlangt 17) zuerst `supabase stop --no-backup`
(verwirft die lokalen Volumes). Die Werte aus `supabase status` sind kein Secret, gehören aber
**nicht ins Repository**: Der anon key ist ein JWT, den der Secret-Scan meldet.

## Edge Functions lokal

`[edge_runtime]` in `supabase/config.toml` bleibt `false` (ADR-015 Punkt 20, ADR-019 Punkt 15):
nur für einen Lauf mit synthetischen Daten auf `true`, danach zurück. Werte nur in
`supabase/functions/.env.local` und `.env.local` (ungetrackt), Schlüssel nie ins Repository.

- **Kartendienst:** `LOCATION_PROVIDER=ptv` (oder `mock`), `PTV_API_KEY`,
  `LOCATION_DATA_GATE=synthetic` und `APP_ENVIRONMENT=development` (ohne gilt Produktion, dort
  antwortet `synthetic` nicht; ADR-019 Punkt 36); das Kartenbild braucht `VITE_PTV_TILE_API_KEY`.
  Dann `supabase db reset`, `supabase start`,
  `supabase functions serve --env-file supabase/functions/.env.local` und `pnpm dev` neu.
- **Plattformzugang** (Einladung einlösen): `PLATFORM_ACCESS_ADMIN_KEY` (service_role key aus
  `supabase status`), `APP_URL=http://<Rechner-IP>:5173`, `MAIL_PROVIDER=mock` und
  `MAIL_MOCK_URL` (Inbucket aus `supabase status`), dann
  `supabase functions serve platform-access --no-verify-jwt --env-file supabase/functions/.env.local`.

## Supabase-Stack ohne Docker

In der Cloud-Umgebung scheitert `supabase start`. `scripts/cloud-stack.sh` baut denselben Pfad aus
Release-Binaries nach, alles unter `.tmp/`, nur `127.0.0.1`, nur synthetische Daten:

```bash
./scripts/cloud-stack.sh start          # ~20 s beim ersten Mal; schreibt .env.development.local
./scripts/cloud-stack.sh reset          # Datenbank neu: alle Migrationen + seed.sql
./scripts/cloud-stack.sh reset --reich  # dazu testpatienten.sql und praxiswoche.sql
./scripts/cloud-stack.sh status         # oder stop
pnpm dev                                # danach; pnpm screenshots --konto=owner /kalender
set -a; . ./.env.development.local; set +a; pnpm test:e2e --project authenticated
```

PostgreSQL 16 auf **54339** (`.tmp/stack-pgdata`), GoTrue, PostgREST und Edge Functions intern auf
54336 bis 54338, ein Gateway in Node statt Kong auf **54321** (CORS, `apikey` als Bearer,
`verify_jwt` aus `config.toml`); Versionen wie `supabase@2.116.0`, mit Prüfsumme im Skript.

- **Storage ist nachgebildet** (`scripts/cloud-stack/storage.mjs`) mit Rolle, Claims und
  `storage.operation` wie die echte API, RLS entscheidet; ohne Bildtransformation, TUS/S3 und
  Bucket-Verwaltung.
- **Kein Mailversand** (GoTrue meldet Erfolg, die Mail verfällt), kein Realtime, kein Studio, kein
  `pg_cron`; PostgreSQL 16 statt 17. Edge Functions ohne `supabase/functions/.env.local` nur mit
  Kartendienst und AI Gateway als Nachbildung.
- **AI Gateway:** Bis zur Anbieterentscheidung (C6, E13) antwortet nur die Nachbildung mit einem
  festen synthetischen Diktat (`AI_PROVIDER=mock`, `APP_ENVIRONMENT=development`, auch in
  `supabase/functions/.env.local`); fehlt eines, gilt die Produktion, und „Sprechen“ fehlt. Das
  Mikrofon braucht `localhost` oder HTTPS.
- Vor E2E-Läufen `reset` ohne `--reich`: Die Tests zählen auf den schlanken Seed. Die Werte stehen
  in `.env.development.local`, nicht in `.env.local`: Die liest auch Vitest, und mit echten Werten
  scheitern `App.nachladen.test.tsx` und `ArbeitszeitJePerson.test.tsx`.

## Bildstrecke: die ganze App als Bilder

`pnpm bildstrecke` nimmt jede Route aus `scripts/bildstrecke/routen.mjs` je Konto bei 375 × 812
(Touch) und 1280 × 800 als Vollseite auf: Praxis, Patientenplattform und Anmeldung. Voraussetzung:
Stack mit `reset --reich` und `pnpm dev`; Adresse über `E2E_BASE_URL`. Ergebnis in
`.tmp/bildstrecke/<Zeit>/` (`--ziel=`): PNGs, `index.html` (Kontaktbogen nach Bereich, Befunde rot)
und `ergebnis.json`. Geprüft: Querscrollen, Konsolenfehler, Anfragen mit 4xx/5xx, Zielseite
erreicht, Fehler- oder Ladezustand, leere Seite. Schreibende Anfragen hält ein Lesewächter an und
meldet sie; die Bildstrecke verändert keine Daten. Teilmengen: `--nur=abrechnung,/training`,
`--konten=therapist`, `--breiten=375`; `--vergleich=<vorher>` schreibt `vergleich.html`
(`--nur-bogen` erzeugt nur die Bögen neu). Eine neue Route ohne Eintrag in `routen.mjs` macht
`pnpm test` rot (`scripts/bildstrecke/bildstrecke.test.mjs`). Während eines Laufs nichts im Projekt
ändern: Eine geänderte Markdown- oder JSON-Datei lädt über Tailwind alle offenen Seiten neu.

## Lokale Sichtung unter Windows (Git Bash)

Alle Befehle im Projektverzeichnis in Git Bash; Docker Desktop muss laufen.

```bash
git fetch origin && git checkout <feature-branch> && git pull --ff-only origin <feature-branch>
pnpm install --frozen-lockfile
supabase start
supabase db reset        # Migrationen + synthetischer Seed
supabase status -o env | grep -E "^(API_URL|ANON_KEY)"
cp .env.example .env.local
```

In `.env.local` (unversioniert) `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` aus
`supabase status -o env` eintragen (der `sb_secret_…`-Schlüssel gehört nirgendwohin), `pnpm dev`
starten und mit einem Konto aus „Testkonten“ über den **Testzugang** unter dem Passkey-Knopf anmelden
(nur außerhalb der Produktion, ADR-025 Punkt 15). Ein Passkey geht lokal nur unter
`http://localhost:5173`: WebAuthn nimmt keine IP-Adresse (`[auth.webauthn]` in `config.toml`).
Echte E2E-Tests im zweiten Fenster mit `E2E_SUPABASE_URL` und `E2E_SUPABASE_ANON_KEY` exportiert,
dann `pnpm test:e2e`; sie stellen den Seed am Ende wieder her. Was nur am Gerät geht:
[`sichtung/`](sichtung/README.md).

| Symptom                                                 | Ursache und Abhilfe                                                                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Port 5173 is already in use`                           | Ein `pnpm dev` läuft noch: `netstat -ano \| findstr :5173` in PowerShell, dann `taskkill /PID <pid> /F`. Der Port ist bewusst fest (`strictPort`). |
| `Konfiguration unvollständig: VITE_SUPABASE_URL fehlt.` | `.env.local` fehlt oder entstand nach dem Start von `pnpm dev`: Dev-Server neu starten.                                                            |
| `E2E_SUPABASE_URL und E2E_SUPABASE_ANON_KEY fehlen.`    | Die beiden `export`-Zeilen gelten nur im aktuellen Fenster.                                                                                        |
| Anmeldung schlägt fehl, obwohl das Kennwort stimmt      | Der Stack läuft nicht oder wurde neu aufgesetzt: `supabase status`, danach `supabase db reset`.                                                    |
| E2E-Tests finden „Erika Beispiel“ nicht                 | Der Seed fehlt: `supabase db reset`.                                                                                                               |
| `WARN: config section [inbucket] is deprecated`         | Warnung, kein Fehler; die Umbenennung nach `[local_smtp]` steht als Wartung in der Roadmap.                                                        |

## Zwei Sessions parallel

Zwei Sessions auf einem Rechner brauchen **zwei Arbeitskopien** als Worktrees
(`git worktree add ../PraxisSoftware-a origin/main --detach`, dann `pnpm install`, `.env.local`
kopieren); Zeilenenden sind überall LF (`.gitattributes`).

- **Ports:** Der Dev-Server ist fest auf 5173 (`strictPort`); die zweite Kopie setzt in
  `.claude/settings.local.json` `{ "env": { "E2E_BASE_URL": "http://127.0.0.1:5174" } }`, dann
  prüfen Playwright und `pnpm screenshots` auf 5174 (von Hand `pnpm dev --port 5174`).
- **Supabase:** höchstens **ein** lokaler Stack. Ändert eine Session Migrationen oder Seed, setzt
  sie ihn zurück; die andere arbeitet so lange ohne `db reset`.
- **Aufgaben:** je Session `/weiter <Aufgabe>` in verschiedenen Modulen, sonst nehmen beide
  dieselbe; die zweite PR vor dem Merge auf `main` nachziehen, danach `git worktree remove`.

## Test-Umgebung (OPS-002a)

Die Anwendung am eigenen Handy, von überall: `https://prtest.uber.space`, dahinter das
Supabase-Projekt `praxis-test` in Frankfurt; nur synthetische Daten, kein Produktivprojekt (§3.1,
§3.2). Einrichtung: [`betrieb/test-umgebung.md`](betrieb/test-umgebung.md).

**Automatisch** spielt `.github/workflows/test-umgebung.yml` nach jeder grünen CI auf `main` den
geprüften Commit ein (nie ein `service_role`- oder `sb_secret_`-Schlüssel im Bundle, Migrationen per
`supabase db push`, Upload per `rsync`, danach Selbstprüfung); fehlt ein Pflicht-Secret, wird
übersprungen, nicht rot.

**Neu aufsetzen** (verwirft alles dort): Actions → „Test-Umgebung“ → „Run workflow“ mit Haken bei
„neu aufsetzen“, spätestens nach einer Woche (die Praxiswoche reicht von vorgestern bis in vier
Tagen, ANN-100); dazu zwölf Testpatient:innen, lokal bleiben es drei Personen für die Tests.

**Basis übernehmen** (einmalig, Haken bei „basis_uebernehmen“, nach grüner CI auf `main`): Bis dahin
überspringt der Workflow die Migrationen mit Warnung und bricht ab, wenn schon eine neue wartet; der
Handstart stellt nur die Historie um, in einer Transaktion und nur bei genau den 341 alten
Versionen (`supabase/testumgebung/basis-uebernehmen.sql`).

**Zugang:** die Konten aus „Testkonten“, **nie** mit dem Entwicklungskennwort, dazu die zweite Tür
(Secrets: [`betrieb/test-umgebung.md`](betrieb/test-umgebung.md), Schritt 4); das Kennwort ist nur
der erste Einstieg, danach Passkey und PIN in „Mein Konto“. Gebaut wird mit
`VITE_APP_ENVIRONMENT=test` (ANN-326); Passkeys sind im Dashboard von `praxis-test` eingeschaltet
(Relying Party „Praxis“, Ursprung `https://prtest.uber.space`), `supabase/config.toml` gilt lokal.

**Kartendienst** (optional, eingerichtet nach Schritt 5 dort; nur synthetische Adressen, ADR-019
Punkt 15): Scheitert das Ausliefern von `location-provider`, bleibt der Lauf mit Warnung grün; dann
den Workflow einmal von Hand starten (ohne „neu aufsetzen“), bei erneutem Fehler
`TESTENV_SUPABASE_ACCESS_TOKEN` prüfen. **Grenzen:** keine Mails (BEF-026), außer
`location-provider` keine Edge Functions (ADR-015 Punkt 20).

## Handytest im WLAN

Für einen Stand vor dem Merge, **nur im eigenen WLAN zu Hause**: in `.env.local`
`VITE_SUPABASE_URL=http://<IP des Rechners>:54321`, `pnpm dev --host`, auf dem Handy
`http://<IP>:5173`; die Windows-Firewall nur für **private Netzwerke** öffnen (5173, 54321). Über
`http://` und eine IP ist die Seite kein sicherer Kontext: keine Kamera, kein Standort, kein
Offline-Speicher, keine Passkeys. Danach `VITE_SUPABASE_URL` für E2E-Tests zurückstellen.

## Testkonten

Alle Konten verwenden das Entwicklungskennwort `LokalerTestzugang!2026`, kein Secret, sondern ein
Platzhalter für eine lokale Wegwerf-Datenbank. Ein Kennwort haben nur diese synthetischen Konten
außerhalb der Produktion; in Produktion gibt es keins (ADR-025 Punkt 9).

| E-Mail                             | Rollen                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `jannes.test@praxis.invalid`       | owner, therapist                                                           |
| `anna.beispiel@praxis.invalid`     | therapist                                                                  |
| `tim.teamleitung@praxis.invalid`   | therapist, team_lead                                                       |
| `olivia.office@praxis.invalid`     | office                                                                     |
| `max.mustermann@patient.invalid`   | keine (Profil ohne Rolle, seit POR-001)                                    |
| `erika.beispiel@patient.invalid`   | keine (Profil ohne Rolle, seit POR-001)                                    |
| `tom.training@praxis.invalid`      | trainer                                                                    |
| `tina.plattform@patient.invalid`   | Plattformkonto: Zugang zu Tinas Training                                   |
| `erika.plattform@patient.invalid`  | Plattformkonto: Zugänge zu Erikas Behandlung und Training                  |
| `paula.begleitung@patient.invalid` | Plattformkonto: Begleitung für Max (POR-EPIC-001b), Max selbst ohne Zugang |

Plattformkonten haben kein Profil und keine Rolle; sie sehen nur das Gerüst unter `/p` (ADR-023).

## Benennung im Code

Gilt für **neuen** Code ab 2026-09-27; bestehender Code wird dafür nicht umbenannt, auch nicht
„nebenbei“, und innerhalb eines Moduls geht Einheitlichkeit vor.

- **Bezeichner englisch** (Datenbank, Ordner, Dateien, Komponenten, Funktionen, Typen, Variablen);
  ein Fachbegriff ohne genaue Entsprechung bleibt deutsch in ASCII (`ausfallhonorar`), im Zweifel
  wie im Datenbankschema. Keine Umlaute oder `ß` in Bezeichnern und Dateinamen.
- **Deutsch bleibt**, was Nutzende sehen, dazu Kommentare, Commit-Nachrichten und `docs/`.

## Kommentare

Gilt für jeden Kommentar, den eine Änderung schreibt oder anfasst (Jannes, 2026-10-25):

- **Höchstens drei Zeilen, nur das Warum.** Braucht eine Begründung mehr Platz, gehört eine
  fachliche oder architektonische Entscheidung ins ADR oder als Annahme ins Register, ein
  Werkzeugdetail hierher; im Code steht der Verweis.
- **Keine Entstehungsgeschichte** („seit …“, „bisher …“) und **keine Kennungen von Tickets oder
  Epics**; erlaubt sind `ANN-NNN`, `ADR-NNN` und Paragrafen der Prinzipien.
- **Der Bestand wird beim Anfassen gekürzt**, nicht in einem Zug.

`pnpm kommentare:check` prüft das für TypeScript, JavaScript, CSS und SQL gegen den gemeinsamen
Vorfahren mit `origin/main` (lokal vorher `git fetch origin main`), nur in Blöcken, die der Diff
berührt. Gezählt werden die Textzeilen zusammenhängender Kommentarzeilen ohne Trennlinien, leere
Zeilen und Werkzeuganweisungen (`eslint-disable…`, `@ts-expect-error`); als Ticket gilt ein Kürzel
mit Bindestrich und drei Ziffern. Die CI prüft im Job „Format, Lint, Dokumentation, Typecheck“.

## Modulgrenzen

Gilt seit Aufräumen Schritt 3 (ANN-748):

- **Ein Modul mit `index.ts` wird von außen nur darüber importiert.** Die Datei nennt jeden Export
  einzeln, kein `export *`; Tests mocken weiter tiefe Pfade. Die ESLint-Regeln
  (`scripts/eslint-modulgrenzen.mjs`) stehen auf Warnung, `pnpm lint` lässt mit `--max-warnings 0`
  aber keine stehen. Umstellen: `index.ts` mit genau den Namen anlegen, die andere Bereiche nutzen;
  `pnpm lint` zeigt jeden tiefen Import.
- **Kein Ring:** Was mehrere Bereiche über den Termin wissen müssen, liegt in `src/lib` (`termin.ts`,
  `zeitband.ts`); `src/lib` importiert kein Modul. **Abfragen der Praxis gehören nie nach
  `src/lib`:** Die Trennungsprüfungen von Plattform und Vorschau erlauben `@/lib/` pauschal (die
  Tagesliste hat dafür `day-plan`). Abschnitte anderer Bereiche setzt die App in Termine über
  `TerminErweiterungen` ein (`src/app/terminErweiterungen.ts`).
- **Domänen (ANN-754):** `src/features` hat 14 Ordner, je Domäne einen (`DOMAENEN` in
  `scripts/domaenen.mjs`), von unten nach oben core < patients < privacy < fleet < billing <
  workforce < calendar < clinical < nutrition < exercise < portal < training < workplace <
  teamchat. Ein Modul liegt in `src/features/<domäne>/<modul>/`, heißt es wie seine Domäne, an
  deren Wurzel. Seiten (`*Page.tsx`, `*Seite.tsx`, `*Layout.tsx`) importieren jede Domäne, jede
  andere Datei eine fremde nur nach unten; was von oben gebraucht wird, reicht die Seite herein,
  oder es zieht nach `src/lib`. `modulgrenzen/nach-unten` meldet Importe nach oben und fremde Ordner.
- **Schnittstelle je Domäne (ANN-755):** Jede Domäne hat eine `index.ts`, die jeden Export einzeln
  nennt. Eine fremde Domäne wird nur über `@/features/<domäne>` importiert, auch von Seiten, die
  eigene nie (die `index.ts` führte im Kreis zurück). Seiten stehen in keiner Schnittstelle, nur der
  Router bindet sie ein. Direkt bleiben `src/routes` und `src/app`, Tests und die Plattform-App mit
  ihren freigegebenen Bausteinen (ADR-023 Punkt 26); innerhalb einer Domäne gilt die `index.ts`
  eines Moduls weiter. `modulgrenzen/nur-ueber-schnittstelle` zeigt jeden tiefen Import.
- `pnpm aufraeumen` zählt gegenseitige Abhängigkeiten, den größten Abhängigkeitsring und die Module
  mit Schnittstelle (`/aufraeumen`).

## Befehle

```bash
pnpm format:check    # Prettier - eigenes CI-Gate, nicht Teil von lint
pnpm format          # dieselbe Prüfung, schreibend
pnpm lint            # ESLint inkl. statischer Sicherheitsanalyse, zwei Läufe je 3 GB Heap
pnpm typecheck       # TypeScript strict
pnpm test            # Komponenten (jsdom) und reine Logik (Node, Projekt logik)
pnpm test:watch      # dieselben Tests, laufend
pnpm test:db         # Migrationen + RLS gegen echtes PostgreSQL
pnpm test:e2e        # Playwright
pnpm docs:check      # Obergrenzen, Register, Verweise, Querverweise, Nummern, Fortschrittstabelle
pnpm migrationen:check  # Migrationen von main unverändert, neue hinten angehängt
pnpm kommentare:check   # geänderte Kommentare: höchstens drei Zeilen, keine Tickets
pnpm audit:katalog   # Aktionen des Auditlogs nur mit Label freigabe-audit geändert
pnpm aufraeumen      # Kennzahlen für /aufraeumen; --schreiben legt sie ab
pnpm fortschritt     # Stand bis zur Eröffnung; --schreiben erzeugt die Roadmap-Tabelle
pnpm db:reset        # Test-Datenbank aus Migrationen neu aufsetzen
pnpm scan:secrets    # Secret-Scan über versionierte Dateien
pnpm build
pnpm preview         # den gebauten Stand lokal ausliefern
```

`pnpm lint` prüft in zwei Läufen nacheinander (`scripts/lint.mjs`), erst die Anwendung, dann die
Tests, je mit 3 GB Heap: Jeder hält nur sein TypeScript-Programm, Spitze 2,7 statt 5,1 GB bei etwa
gleicher Dauer. `scripts/lint.test.mjs` hält fest, dass beide genau die Dateien von `eslint .`
prüfen. Kein `--cache`: Typbasierte Regeln übersähen einen neuen Fehler in einer unveränderten
Datei. Eine `.test.ts`-Datei läuft ohne DOM, sonst `// @vitest-environment jsdom` in der ersten
Zeile; `.test.tsx` läuft mit jsdom. Playwright prüft vor der Anmeldung nur `mobile` (Pixel 7), die
Breiten setzt jede Spezifikation (ANN-571); ein System-Chromium über
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Das Modell setzt `.claude/settings.json`, den Aufwand `CLAUDE.md`.

**docs:check** ist ein Gate nach ADR-013 (Prüfung 2.10) im Job „Format, Lint, Dokumentation,
Typecheck“. Die Regeln stehen in `scripts/docs-check-regeln.mjs`, jede Grenze wird nur gesenkt, nie
still gehoben (`docs-check.test.mjs` hält die Werte fest):

- **Obergrenzen (E):** Jede Markdown-Datei hat eine Zeilen- und eine Bytegrenze (Bytes, weil sich
  Zeilen mit einer langen Zeile umgehen lassen): die Standardgrenze, größere Dateien einzeln; was
  ganz gelesen wird (CLAUDE.md, STATUS, Skills, ARBEITSBEREICHE, DESIGN.md, PLATTFORM.md) eine
  engere; alle zusammen höchstens 10.000 Zeilen und 900 KB. Wächst eine Datei, wandert Älteres nach
  Git. In den von Hand gepflegten Dateien (`.prettierignore`) folgt der Text direkt der Überschrift. Die Werte: `STANDARDGRENZE`, `DATEIGRENZEN`, `OBERGRENZEN`, `SKILL_GRENZE_BYTES`,
  `GESAMTGRENZE`.
- **Annahmenregister (F):** Vorspann höchstens 40 Zeilen; Einträge im Prüfpaket und bei den
  Fachregeln höchstens 5 Zeilen und 800 bzw. 600 Bytes, die übrigen als Tabellenzeile bis 240
  Bytes. Kategorie und Status nur aus dem Lebenszyklus; der Zusatz `Prüfpaket` genau dann, wenn
  Datenschutz oder Recht und nicht verworfen, und dann im Abschnitt „Prüfpaket“. Jede Kennung hat
  einen Anker in `src/`, `supabase/migrations/` oder `.github/workflows/`; Tests zählen nicht.
- **Links:** Jeder relative Markdown-Verweis zeigt auf eine vorhandene Datei.
- **Querverweise (A bis C):** Genannte ADR-Fassungen, Versionen und Abschnitte der Prinzipien gibt
  es (Index: `docs/adr/README.md`); wer eine Fassung als „Grundlage“ nennt, nennt die geltende;
  unter „Änderungsvermerk“, „Änderungshistorie“ oder „Chronik“ darf die Vergangenheit stehen.
- **Nummern (D):** Jede `ANN-`, `BEF-` und `IDEA-`Kennung steht einmal als Überschrift oder als
  Zeile ihres Registers; ein Befund trägt nur eine der offenen Kennungen aus `OFFENE_BEFUNDE`.
- **Fortschritt:** Die Tabelle der Roadmap ist genau die, die `pnpm fortschritt --schreiben` aus
  `development/fortschritt.json` erzeugt.

**migrationen:check** läuft im eigenen Job „Ausgelieferte Migrationen unveraendert“; der Pflichtcheck
„Migrationen und RLS-Policies“ wartet auf ihn. Eine Migration auf `main` ist in der Test-Umgebung
eingespielt, und `supabase db push` führt sie dort nie wieder aus: Das Gate weist jede Änderung,
Umbenennung oder Löschung ab, ebenso eine neue Migration, deren Version nicht hinter der jüngsten
auf `main` liegt. Eine Korrektur ist eine neue Migration; was nur auf dem Branch liegt, darf bis
zum Merge geändert werden. Lokal vergleicht das Gate mit `origin/main` (vorher
`git fetch origin main`), im Pull Request mit dem Merge auf den aktuellen `main`.

## Bekannte Einschränkungen

1. **E2E hinter der Anmeldung braucht einen Supabase-Stack** (`E2E_SUPABASE_URL`, `…_ANON_KEY`);
   die CI startet ihn im Job `e2e-supabase`, ohne Docker trägt ihn `scripts/cloud-stack.sh`.
2. **Der Secret-Scan prüft nur den aktuellen Stand**, nicht die Git-Historie; dafür GitHub Secret
   Scanning und Push Protection (unten).
3. **Die statische Sicherheitsanalyse ist `eslint-plugin-security`**, sinnvoll für
   JavaScript/TypeScript, aber kein vollwertiges SAST.
4. **Abgewiesene Schreibzugriffe** auf Rollen und Konten, Legal Hold und Löschaufträge antworten
   mit HTTP 403 in bestätigter Transaktion (`app.record_denied_write`, ANN-115); die echte Antwort
   über PostgREST ist nur lokal mit `supabase start` zu sehen.
5. **Löschlauf und automatische Finalisierung brauchen `pg_cron`** (ADR-016 Punkt 7, ANN-007); ohne
   sie wird nicht gelöscht. Ob die Jobs laufen: `select jobname, schedule from cron.job;`.
6. **Ein Termin mit Dokumentation lässt sich weiterhin absagen.** Ob das fachlich zulässig sein
   soll, ist offen; der Entwurf bleibt erhalten und lesbar.

## Manuelle Schritte im Repository

Diese Einstellungen lassen sich nicht aus dem Code setzen:

- Branch Protection auf `main` (Kriterium von M3): erforderliche Checks unter ihren Anzeigenamen
  „Lint, Typecheck, Tests, Build“ (`quality`), „Migrationen und RLS-Policies“ (`database`),
  „Secret Scanning und Dependency Audit“ (`security`), „End-to-End“ (`e2e`), „End-to-End hinter der
  Anmeldung“ (`e2e-supabase`) und „Aktionen des Auditlogs unveraendert oder freigegeben“
  (`audit-katalog.yml`); Force Push und Deletions aus; keine Pflicht-Approvals (ADR-013).
- Das Label `freigabe-audit` anlegen. Es setzt nur Jannes; die Prüfung erkennt die Freigabe nur,
  wenn der Inhaber des Repositorys es zuletzt gesetzt hat.
- GitHub Secret Scanning und Push Protection aktivieren.
- Gemergte Branches automatisch löschen („Automatically delete head branches“). „Allow auto-merge“
  gibt es auf diesem GitHub-Plan nicht; Jannes mergt nach grüner CI.
- Dependabot oder eine vergleichbare Aktualisierung der Abhängigkeiten.
- **Die Supabase-CLI-Version in `.github/workflows/ci.yml` von Hand erhöhen**
  (<https://www.npmjs.com/package/supabase>): `latest` fragt bei jedem Lauf ohne Token die
  GitHub-API und lief am 2026-09-05 ins Rate Limit; fest ist das Gate reproduzierbar (ADR-013).
