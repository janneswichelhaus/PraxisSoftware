# Entwicklungsumgebung

Stand: 2026-09-23 · verbindlich sind `PROJECT_PRINCIPLES.md` und `docs/adr/`.

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
Supabase-Instanz eingespielt. Was Supabase in `public` von selbst an `anon`,
`authenticated` und `service_role` vergibt, kennt der Shim nicht; ein Entzug
dieser Rechte wirkt deshalb nur in Supabase.

Der Stand ist jederzeit aus **Migrationen + Seed** reproduzierbar. Es gibt
keinen manuell gepflegten Zwischenzustand.

**Basis.** `supabase/migrations/` beginnt mit `20261225000000_basis.sql`, dem
Abzug der 341 Migrationen davor (ROADMAP 7.16), erzeugt von
`node scripts/basis-migration.mjs schreiben` und nie von Hand geändert; neue
Migrationen kommen dahinter. `node scripts/basis-migration.mjs pruefen <ref>`
baut den Stand `<ref>` und den Arbeitsbaum auf, je ohne und mit den Vorgaben von
Supabase, und vergleicht Schema, Rechte und Daten. Die alten Dateien, auf die
Kommentare und Doku noch verweisen, zeigt `git show aabe5d0:<pfad>`. Eine
lokale Datenbank von vorher braucht einmal `pnpm db:reset`, `supabase db reset`
oder `./scripts/cloud-stack.sh reset`.

In der CI läuft `pnpm test:db` in vier Teilen nebeneinander
(`pnpm test:db --shard=<n>/4`, Jobs „Migrationen und RLS-Tests (Teil n/4)“),
jeder mit eigener Datenbank; in einem Stück dauerte es zuletzt 13 bis 20
Minuten. Der Pflichtcheck „Migrationen und RLS-Policies“ (`database`) ist nur
grün, wenn alle Teile und das Migrationen-Gate es sind;
`src/werkzeugkette.test.ts` hält Matrix, Teilzahl und Sammelprüfung zusammen.
Lokal bleibt es ein Lauf; ein einzelner Teil lässt sich mit `--shard`
nachstellen.

Ebenso aufgeteilt (ANN-571): Die E2E-Tests hinter der Anmeldung laufen in
drei Teilen mit je eigenem Supabase-Stack (`--shard=<n>/3`, Jobs „End-to-End
hinter der Anmeldung (Teil n/3)“, Pflichtcheck sammelt unter dem alten
Namen), Unit-Tests mit Build im Job „Unit-Tests und Build“ neben „Format,
Lint, Dokumentation, Typecheck“ (Pflichtcheck „Lint, Typecheck, Tests,
Build“). Ändert oder ergänzt ein Pull Request nur Dokumentation, entfallen
dort Tests, Build, Datenbank- und E2E-Prüfungen (ADR-013 Punkt 2, Fassung 5;
`scripts/nur-doku.mjs` in der Fassung des Zielbranchs); die Sammeljobs
laufen mit `always()`, ein abgebrochener Teil macht sie rot. Auf `main`
läuft nach dem Merge alles.

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

## Supabase-Stack ohne Docker

In der Cloud-Umgebung scheitert `supabase start`. `scripts/cloud-stack.sh` baut denselben Pfad aus
Release-Binaries nach — alles unter `.tmp/`, nur `127.0.0.1`, nur synthetische Daten:

```bash
./scripts/cloud-stack.sh start          # ~20 s beim ersten Mal; schreibt .env.development.local
./scripts/cloud-stack.sh reset          # Datenbank neu: alle Migrationen + seed.sql
./scripts/cloud-stack.sh reset --reich  # dazu testpatienten.sql und praxiswoche.sql
./scripts/cloud-stack.sh status         # oder stop
pnpm dev                                # danach; pnpm screenshots --konto=owner /kalender
set -a; . ./.env.development.local; set +a; pnpm test:e2e --project authenticated
```

PostgreSQL 16 läuft als eigener Cluster auf **54339** (`.tmp/stack-pgdata`), GoTrue mit seinen
eigenen Migrationen für `auth`, PostgREST und die Edge Functions in Deno intern auf 54336 bis 54338.
Ein Gateway in Node übernimmt Kongs Rolle auf **54321** (CORS, `apikey` als Bearer, `verify_jwt` aus
`supabase/config.toml`). GoTrue und PostgREST in den Versionen von `supabase@2.116.0`, mit Prüfsumme
im Skript; das JWT-Secret entsteht beim ersten Start zufällig in `.tmp/stack/`. Stand 2026-10-12:
145 von 145 Tests hinter der Anmeldung grün (einer erst im zweiten Lauf).

Grenzen:

- **Storage ist nachgebildet** (`scripts/cloud-stack/storage.mjs`): hochladen, signieren, laden,
  auflisten, kopieren, verschieben, löschen — mit Rolle, Claims und `storage.operation` wie die
  echte API, RLS entscheidet. Keine Bildtransformation, kein TUS/S3, keine Bucket-Verwaltung.
- **Kein Mailversand:** GoTrue ohne SMTP meldet Erfolg, die Mail verfällt. Kein Realtime, kein
  Studio, kein `pg_cron`; PostgreSQL 16 statt 17 wie im Docker-Stack. Edge Functions ohne `supabase/functions/.env.local` nur mit dem
  Kartendienst und dem AI Gateway als Nachbildung.

**AI Gateway lokal (KI-EPIC-001).** Das Diktat der Schreibseite geht an die Edge Function
`ai-gateway`; bis zur Anbieterentscheidung (C6, E13) antwortet nur die Nachbildung mit einem festen
synthetischen Diktat, gleich was gesprochen wird. Der Cloud-Stack setzt dafür ohne eigene Datei
`AI_PROVIDER=mock` und `APP_ENVIRONMENT=development`; wer `supabase/functions/.env.local` pflegt
(ungetrackt), trägt beide Zeilen dort ein. Vor „Sprechen" fragt die Seite den Gateway (`GET`), ob er
das Diktat anbietet: Fehlt `AI_PROVIDER` oder `APP_ENVIRONMENT` (dann gilt die Produktion, und dort
antwortet die Nachbildung nicht), steht „Sprechen" nicht da. Das Mikrofon braucht `localhost` oder
HTTPS. Die Test-Umgebung gibt es seit TEAM-004 der eigenen Herkunft frei (`microphone=(self)`,
ADR-017 Punkt 33, Fassung 9) - für Sprachnachrichten im Teamchat; „Sprechen" steht dort weiter nur,
wenn der Gateway das Diktat anbietet. Sperrt eine Policy das Mikrofon und meldet der Browser das
(Chromium, `document.featurePolicy`), bietet die Seite weder „Sprechen" noch die Sprachnachricht an.

- Vor E2E-Läufen `reset` ohne `--reich`: Die Tests zählen auf den schlanken Seed. Port 54329 bleibt
  `pnpm test:db`; `TEST_DATABASE_URL` nie auf 54339 richten. Die Werte stehen in
  `.env.development.local`, nicht in `.env.local`: Die liest auch Vitest, und mit echten Werten
  scheitern `App.nachladen.test.tsx` und `SchedulingPage.test.tsx`.

## Bildstrecke: die ganze App als Bilder

`pnpm bildstrecke` nimmt jede Route aus `scripts/bildstrecke/routen.mjs` je Konto bei 375 × 812
(Touch) und 1280 × 800 als Vollseite auf — Praxis, Patientenplattform und Anmeldung. Voraussetzung:
Stack mit `reset --reich` und `pnpm dev`; Adresse über `E2E_BASE_URL`. Ergebnis in
`.tmp/bildstrecke/<Zeit>/` (`--ziel=`): PNGs, `index.html` (Kontaktbogen nach Bereich, Befunde rot)
und `ergebnis.json`. Geprüft: Querscrollen, Konsolenfehler, Anfragen mit 4xx/5xx, Zielseite
erreicht, Fehler- oder Ladezustand, leere Seite. Schreibende Anfragen hält ein Lesewächter an und
meldet sie — die Bildstrecke verändert keine Daten. Teilmengen: `--nur=abrechnung,/training`,
`--konten=therapist`, `--breiten=375`; `--vergleich=<vorher>` schreibt `vergleich.html`
(`--nur-bogen` erzeugt nur die Bögen neu). Eine neue Route ohne Eintrag in `routen.mjs` macht
`pnpm test` rot (`scripts/bildstrecke/bildstrecke.test.mjs`).

## Lokale Sichtung unter Windows (Git Bash)

Ablauf, um einen Stand lokal anzusehen — für eine Sichtung oder einen Feature-Branch. Alle Befehle laufen im
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

Anmeldung mit einem Konto aus „Testkonten" und dem Entwicklungskennwort über
den **Testzugang** unter dem Passkey-Knopf (nur außerhalb der Produktion,
ADR-025 Punkt 15). Passkey und App-PIN richtet „Mein Konto“ ein; ein Passkey
geht lokal nur unter `http://localhost:5173`, nicht unter `127.0.0.1`: WebAuthn
nimmt keine IP-Adresse als Relying Party (`[auth.webauthn]` in
`supabase/config.toml`).

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

**7. Sichtung**

Gesichtet wird über die Bildstrecke einer PR mit `/sichtung`; was nur am
Gerät geht, steht auf der Sichtliste in [`sichtung/`](sichtung/README.md). Am
Handy geht das mit „Handytest im WLAN" unten.

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

## Zwei Sessions parallel

Zwei Claude-Code-Sessions auf demselben Rechner brauchen **zwei Arbeitskopien**
— in einem Ordner schrieben sie sich gegenseitig in dieselben Dateien. Git
legt sie als Worktrees neben das Repository; sie teilen die Historie, nicht die
Dateien.

```bash
git fetch origin
git worktree add ../PraxisSoftware-a origin/main --detach
git worktree add ../PraxisSoftware-b origin/main --detach
```

In jedem neuen Ordner einmal `pnpm install` und `.env.local` aus dem
Hauptordner kopieren. Die Session legt ihren Branch selbst an (Schritt 1 von
`/weiter`).

- **Ports.** Der Entwicklungsserver ist fest auf 5173 (`strictPort`). Die
  zweite Arbeitskopie bekommt einen eigenen Port über
  `.claude/settings.local.json` (nicht versioniert):
  `{ "env": { "E2E_BASE_URL": "http://127.0.0.1:5174" } }`. Playwright und
  `pnpm screenshots` starten und prüfen dann auf 5174; von Hand
  `pnpm dev --port 5174`. Ohne das prüfte die zweite Session still den Server
  der ersten.
- **Supabase.** Es läuft höchstens **ein** lokaler Stack (dieselbe
  `project_id`). Ändert eine Session Migrationen oder Seed, startet und setzt
  sie ihn zurück; die andere arbeitet so lange ohne `db reset`.
- **Aufgaben.** `/weiter` nimmt die erste offene Aufgabe — in zwei Sessions
  dieselbe. Deshalb je Session `/weiter <Aufgabe>` mit zwei Aufgaben, die
  verschiedene Module berühren. `STATUS.md`, Roadmap und `fortschritt.json`
  ändern beide; die zweite Pull Request wird vor dem Merge auf `main`
  nachgezogen.
- **Aufräumen.** `git worktree remove ../PraxisSoftware-a`, sobald die Pull
  Request gemergt ist.

## Test-Umgebung (OPS-002a)

Die Anwendung am eigenen Handy, von überall: `https://<kontoname>.uber.space`
(heute `prtest`), dahinter das Supabase-Projekt `praxis-test` in Frankfurt. Nur
synthetische Daten, kein Produktivprojekt (§3.1, §3.2). Einrichtung und Wahl
des Anbieters: [`hosting-optionen.md`](decisions/hosting-optionen.md).

**Was automatisch passiert.** Nach jeder grünen CI auf `main` spielt
`.github/workflows/test-umgebung.yml` den geprüften Commit ein: Konfiguration
prüfen (nie ein `service_role`- oder `sb_secret_`-Schlüssel im Bundle),
Migrationen per `supabase db push`, Build, `.htaccess` und `robots.txt`
erzeugen, Upload per `rsync` über IPv4 nach `~/www/html`, danach die Seite
selbst prüfen (Startseite, tiefe Route, Kopfzeilen, zweite Tür). Fehlt eines
der sieben Pflicht-Secrets, wird übersprungen, nicht rot.

**Neu aufsetzen** (Seed und Praxiswoche, verwirft alles dort): GitHub →
Actions → „Test-Umgebung" → „Run workflow" auf `main`, Haken bei „neu
aufsetzen". Beim allerersten Lauf gegen ein leeres Projekt geschieht das von
selbst.

**Basis übernehmen** (einmalig, Haken bei „basis_uebernehmen"): Die
Test-Umgebung kennt noch die 341 Versionen vor der Basis. Bis zu diesem
Handstart überspringt der Workflow die Migrationen mit einer Warnung, denn die
Basis bringt kein neues Schema; wartet schon eine neue Migration, bricht er ab. Der
Handstart stellt nur die Historie um, in einer Transaktion und nur, wenn sie
genau diese Versionen enthält (`supabase/testumgebung/basis-uebernehmen.sql`).
Wie jede Auslieferung geht er erst, wenn die CI für den Stand von `main` grün ist. Die Praxiswoche sind die Werktage von vorgestern bis in vier Tagen;
nach einer Woche einfach wieder neu aufsetzen (ANN-100). Zum Seed kommen dort
zwölf weitere Testpatient:innen (`supabase/testumgebung/testpatienten.sql`,
AKTE-009) – lange Namen, minderjährig, Einrichtung, ohne Telefon, mit und ohne
Grundlage, Anmeldebogen teils offen – mit vierzehn Terminen je Werktag. Der
lokale Seed behält seine drei Personen, weil die Tests auf sie zählen.

**Zugang.** Dieselben Konten wie unter „Testkonten", aber **nie** mit dem
Entwicklungskennwort: Alle Konten bekommen das Kennwort aus dem Secret
`TESTENV_LOGIN_PASSWORD` (mindestens 12 Zeichen). Fehlt es, sind alle Konten
gesperrt. Vor der Seite steht die **zweite Tür** (Benutzer `praxis`, Kennwort
aus `TESTENV_TUER_PASSWORD`), sofern das Secret gesetzt ist (ANN-101). Die
beiden Secrets sind optional und liegen wie die übrigen in der Umgebung `test`.
Das Kennwort ist nur der erste Einstieg über den Testzugang (ADR-025 Punkt 15);
danach in „Mein Konto“ Passkey und PIN einrichten und wie im Betrieb benutzen.

**Passkeys (SEC-EPIC-002).** Der Workflow baut mit `VITE_APP_ENVIRONMENT=test`
(ANN-326). Passkeys sind im Dashboard von `praxis-test` unter Authentication
eingeschaltet (Jannes, 2026-10-11), mit Relying Party Name „Praxis“, Domain
`prtest.uber.space` und Ursprung `https://prtest.uber.space`; die Werte in
`supabase/config.toml` gelten nur lokal.

**Kartendienst (optional, 2026-10-04).** Mit dem Secret
`TESTENV_SUPABASE_ACCESS_TOKEN` liefert der Lauf die Edge Function
`location-provider` aus (Route, Fahrzeiten, Verorten). Erst mit einem eigenen
Kachelschlüssel `TESTENV_PTV_TILE_API_KEY` kommt das Kartenbild dazu, samt
Kartendienst in der Content-Security-Policy; der kostenlose PTV-Plan hat nur
einen Schlüssel, und der Serverschlüssel gehört nie ins Bundle (ADR-019
Punkt 19). Die Einstellungen
der Function setzt Jannes im Supabase-Projekt selbst
([`hosting-optionen.md`](decisions/hosting-optionen.md), Schritt 2e); der
Workflow schreibt sie nicht. Nur synthetische Adressen (ADR-019 Punkt 15).
Scheitert das Ausliefern der Function, etwa bei einer Störung der
Verwaltungs-API von Supabase, bleibt der Lauf trotzdem grün mit einer Warnung:
Die Oberfläche wird ausgeliefert, die Function behält ihren bisherigen Stand.
Danach den Workflow einmal von Hand starten (ohne „neu aufsetzen"); scheitert
er erneut, das Secret `TESTENV_SUPABASE_ACCESS_TOKEN` prüfen (2026-10-06).

**Grenzen.** Keine Mails (Anmeldelinks, Einladungen: BEF-026); außer
`location-provider` keine Edge Functions (ADR-015 Punkt 20). Ohne Kartendienst
zeigt die Karte ihren Hinweis. Das kostenlose Supabase-Projekt pausiert nach
einer Woche ohne Nutzung; im Dashboard wieder starten.

## Handytest im WLAN

Ohne Test-Umgebung, etwa für einen Stand, der noch nicht auf `main` liegt,
läuft die Anwendung vom eigenen
Rechner aufs eigene Handy — **nur im eigenen WLAN zu Hause**, nie in einem
fremden oder öffentlichen Netz, und wie überall nur mit synthetischen Daten.

1. IP-Adresse des Rechners im WLAN ermitteln (`ipconfig` in PowerShell,
   „IPv4-Adresse", etwa `192.168.178.20`).
2. In `.env.local` `VITE_SUPABASE_URL=http://<IP>:54321` setzen — das Handy
   erreicht `127.0.0.1` des Rechners nicht. Der Rechner selbst kommt mit der
   IP ebenso an.
3. `pnpm dev --host` starten; auf dem Handy `http://<IP>:5173` öffnen und mit
   einem Testkonto anmelden.
4. Fragt die Windows-Firewall, den Zugriff nur für **private Netzwerke**
   erlauben (Node für 5173, Docker für 54321).

Grenzen: Über `http://` und eine IP ist die Seite kein sicherer Kontext —
Kamera, Standort und Offline-Speicher des Browsers stehen dort nicht zur
Verfügung, Passkeys ebenso nicht. Links aus Mails (Anmeldelink, Einladung) zeigen weiter auf
`127.0.0.1` und öffnen nur am Rechner (`supabase/config.toml`, `site_url`).
Nach dem Test `VITE_SUPABASE_URL` zurückstellen, wenn E2E-Tests laufen sollen.

## Testkonten

Alle Konten verwenden das Entwicklungskennwort `LokalerTestzugang!2026`. Das ist
kein Secret, sondern ein Platzhalter für eine lokale Wegwerf-Datenbank. Ein
Kennwort haben nur diese synthetischen Testkonten außerhalb der Produktion;
in Produktion gibt es keins (ADR-025 Punkt 9).

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

Plattformkonten haben kein Profil und keine Rolle; sie sehen nur das Gerüst
unter `/p` (ADR-023, POR-EPIC-001).

## Benennung im Code

Gilt für **neuen** Code ab 2026-09-27. Bestehender Code wird dafür **nicht**
umbenannt — auch nicht „nebenbei“ in einer berührten Datei; innerhalb eines
Moduls geht Einheitlichkeit vor der Regel.

- **Bezeichner englisch:** Datenbank (Tabellen, Spalten, Funktionen — so ist es
  bereits), Ordner unter `src/features/`, Dateien, Komponenten, Funktionen,
  Typen, Variablen.
- **Fachbegriff ohne genaue Entsprechung bleibt deutsch**, in ASCII
  (`ausfallhonorar`, nicht `ausfallhonorär`), statt einer irreführenden
  Übersetzung. Im Zweifel den Begriff nehmen, den das Datenbankschema schon
  verwendet.
- **Deutsch bleiben:** alles, was Nutzende sehen (Oberfläche, Fehlermeldungen,
  Dokumente), Kommentare, Commit-Nachrichten und `docs/`.
- Keine Umlaute oder `ß` in Bezeichnern und Dateinamen.

## Kommentare

Gilt für jeden Kommentar, den eine Änderung schreibt oder anfasst (Jannes, 2026-10-25):

- **Höchstens drei Zeilen, nur das Warum.** Was der Code tut, sagt der Code. Braucht eine
  Begründung mehr Platz, gehört eine fachliche oder architektonische Entscheidung ins ADR oder als
  Annahme ins Register, ein Werkzeugdetail hierher; im Code steht der Verweis.
- **Keine Entstehungsgeschichte** („seit …“, „bisher …“) und **keine Kennungen von Tickets oder
  Epics** — die stehen in Commit und PR. Erlaubt sind `ANN-NNN`, `ADR-NNN` und Paragrafen der
  Prinzipien.
- **Der Bestand wird beim Anfassen gekürzt**, nicht in einem Zug: Wer einen langen Kommentar
  ändert, kürzt ihn.

`pnpm kommentare:check` prüft das für TypeScript, JavaScript, CSS und SQL gegen den gemeinsamen
Vorfahren mit `origin/main` (lokal vorher `git fetch origin main`), ohne Abhängigkeiten. Gezählt
werden die Textzeilen eines Blocks zusammenhängender Kommentarzeilen; Trennlinien, leere Zeilen und
Anweisungen an Werkzeuge (`eslint-disable…`, `@ts-expect-error`) zählen nicht. Geprüft werden nur
Blöcke, die der Diff berührt; als Ticket gilt ein Kürzel mit Bindestrich und drei Ziffern. Die CI
führt die Prüfung im Job „Format, Lint, Dokumentation, Typecheck“ hinter dem Lint aus.

`/aufraeumen` (`.claude/skills/aufraeumen/SKILL.md`) misst mit `pnpm aufraeumen` Zeilen,
Kommentaranteil, Modulgrenzen, große Dateien, Doppelungen und DB-Funktionen, vergleicht mit
`development/AUFRAEUMEN.md` und schlägt drei Vereinfachungen vor, ohne Code zu ändern. Die Ablage
ist Markdown, damit eine Aufräumrunde als reine Doku durch die CI geht.

## Befehle

```bash
pnpm format:check    # Prettier - eigenes CI-Gate, nicht Teil von lint
pnpm format          # dieselbe Prüfung, schreibend
pnpm lint            # ESLint inkl. statischer Sicherheitsanalyse
pnpm typecheck       # TypeScript strict
pnpm test            # Komponenten (jsdom) und reine Logik (Node, Projekt logik)
pnpm test:watch      # dieselben Tests, laufend
pnpm test:db         # Migrationen + RLS gegen echtes PostgreSQL
pnpm test:e2e        # Playwright
pnpm docs:check      # Obergrenzen, Register, Verweise, Querverweise, Nummern, Fortschrittstabelle
pnpm migrationen:check  # Migrationen von main unverändert, neue hinten angehängt
pnpm kommentare:check   # geänderte Kommentare: höchstens drei Zeilen, keine Tickets
pnpm aufraeumen      # Kennzahlen für /aufraeumen; --schreiben legt sie ab
pnpm fortschritt     # Stand bis zur Eröffnung; --schreiben erzeugt die Roadmap-Tabelle
pnpm db:reset        # Test-Datenbank aus Migrationen neu aufsetzen
pnpm scan:secrets    # Secret-Scan über versionierte Dateien
pnpm build
pnpm preview         # den gebauten Stand lokal ausliefern
```

Eine `.test.ts`-Datei läuft ohne DOM; braucht sie `window` oder `document`,
steht `// @vitest-environment jsdom` in ihrer ersten Zeile. `.test.tsx` läuft
immer mit jsdom. Playwright prüft vor der Anmeldung nur das Projekt `mobile`
(Pixel 7); die Breiten setzt jede Spezifikation selbst (ANN-571).

`pnpm docs:check` ist ein Gate nach ADR-013 (Prüfung 2.10) und läuft im Job
„Format, Lint, Dokumentation, Typecheck" direkt hinter dem Lint. Es prüft die
Obergrenzen von `CLAUDE.md` (150), `docs/STATUS.md` (60) und
`OPEN_DECISIONS.md` (400) und im Annahmenregister höchstens 14 Zeilen **je
Eintrag**; dass jede `ANN-NNN` des Registers einen Anker in `src/`,
`supabase/migrations/` oder `.github/workflows/` hat; dass jeder relative
Markdown-Verweis auf eine vorhandene Datei zeigt; Querverweise und eindeutige
Nummern (G19); und dass die Fortschrittstabelle der Roadmap genau die ist, die
`pnpm fortschritt --schreiben` aus `development/fortschritt.json` erzeugt.

`pnpm migrationen:check` läuft im eigenen Job „Ausgelieferte Migrationen
unveraendert" neben den Teilen von `test:db`; der Pflichtcheck „Migrationen
und RLS-Policies" wartet auf ihn (BEF-123). Eine Migration, die auf `main` liegt, ist in der
Test-Umgebung eingespielt; `supabase db push` führt sie dort nie wieder aus.
Das Gate weist deshalb jede Änderung, Umbenennung oder Löschung einer solchen
Datei ab, ebenso eine neue Migration, deren Version nicht hinter der jüngsten
auf `main` liegt. Eine Korrektur ist eine neue Migration. Migrationen, die nur
auf dem Branch liegen, dürfen bis zum Merge geändert werden. Einmalig ersetzt
die Basis alle älteren Migrationen (Jannes, 2026-10-25): Mit ihr müssen alle
gehen, geändert wird keine. Lokal vergleicht
das Gate mit `origin/main` (vorher `git fetch origin main`), im Pull Request
mit dem Merge auf den aktuellen `main`.

**Modell und Aufwand.** `.claude/settings.json` setzt Opus 5 projektweit. Einen
Aufwand je Aufgabe kennt die Datei nicht; die Regel „Migration, RLS, Policy
oder Zweitreview mit `/effort xhigh`" steht in [`../CLAUDE.md`](../CLAUDE.md)
(„Arbeitsweise", K1). In der
Weboberfläche hat die Modellwahl beim Sessionstart Vorrang — die Datei gilt für
CLI-Sessions.

Steht ein Chromium bereits im System, kann er ohne Download verwendet werden:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/pfad/zu/chromium
```

## Wochenroutine

**Abgeschaltet am 2026-09-23** (Jannes, Umbau U3). Die Routine
`trig_01N5FanspQGxJP9S9rnZiZHj` (montags 07:50 Uhr, Haiku 4.5) bleibt
gespeichert, feuert aber nicht mehr; ihr Prompt verweist nur auf den Abschnitt
„Wochenupdate" in [`development/ROADMAP.md`](development/ROADMAP.md). Wieder
einschalten: Routines-Oberfläche auf claude.ai oder eine Anweisung in einer
Session. Den Stand liefert bis dahin `docs/STATUS.md` und `pnpm fortschritt`;
das Wochenupdate lässt sich als Planungssession von Hand starten.

## Go-live-Blocker

**Die Praxis eröffnet im Juli 2027 ohne Vorgängersystem — der einzige
Termin des Projekts; alles andere steht in einer Reihenfolge** (entschieden am 2026-09-05 und
2026-09-06, auf einen Termin zurückgeführt am 2026-09-21; Meilensteine, die
Kette bis zur Eröffnung und die Etappen G und H in
[`development/ROADMAP.md`](development/ROADMAP.md)).

Offene Punkte führt [`decisions/OPEN_DECISIONS.md`](decisions/OPEN_DECISIONS.md),
die Reihenfolge [`development/ROADMAP.md`](development/ROADMAP.md)
(„Entscheidungen und Prüfungen", Etappe G). Hier steht nur, was im Code offen ist:

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
`get_treatment_note_versions`, und beide Funktionen schreiben in derselben
Transaktion „Akte geöffnet“ (`patient_record.viewed`, höchstens einmal je
Person, Akte und Kalendertag über `app.log_record_access`, LOG-EPIC-001,
ANN-230). Damit gibt es keinen Weg, klinischen Freitext ohne Protokolleintrag
zu lesen (ADR-010). Die Begründung einer Korrektur zählt dabei
wie Inhalt: sie steht in der Versionstabelle, niemals im Auditlog.

In der Akte gilt dasselbe Muster (DOK-003, ROL-001):
`list_patient_treatment_notes` liefert allen vier Praxisrollen — seit E15 auch
`office` — die Einträge aller Termine eines Patienten und protokolliert
dasselbe „Akte geöffnet“, einmal am Tag statt je Eintrag. Der Behandlungsnachweis
`list_patient_treatment_evidence` bleibt als Rechnungssicht ohne klinischen
Inhalt und ohne eigenen Auditeintrag bestehen (ADR-004 Fassung 2 Punkt 4); die
Akte fragt ihn nicht mehr an. Beide Sichten blättern über dieselbe Seitenregel
`app.patient_record_page` mit höchstens 50 Terminen je Aufruf. Verordnung mit
Diagnose und klinische Dateien liest `office` seit ROL-002 ebenso; protokolliert
werden das Öffnen der Akte und das Herunterladen einer Datei
(`patient_file.downloaded`). Die Schreibrechte sind unverändert.

Seit DOK-004 kennt das Auditlog einen **Systemakteur**: Ereignisse eines
zeitgesteuerten Vorgangs — heute die automatische Finalisierung — tragen
`actor_kind = 'system'` und keinen Account; die Auditansicht zeigt sie als
„System", der Benutzerfilter blendet sie aus (ANN-009).

Der Ereigniskatalog steht doppelt: als Check-Constraint auf `audit_log.action`
und in `src/features/audit/actions.ts`. Ein Datenbanktest hält beide
deckungsgleich.

## Bekannte Einschränkungen

1. **Die E2E-Abläufe hinter der Anmeldung brauchen einen Supabase-Stack.** Sie
   werden über `E2E_SUPABASE_URL` / `E2E_SUPABASE_ANON_KEY` freigeschaltet
   (siehe „Lokale Sichtung"). In CI startet der Job „End-to-End hinter der
   Anmeldung" (`e2e-supabase`) den Docker-Stack selbst; ohne Docker — etwa in
   der Cloud-Entwicklungsumgebung — trägt `scripts/cloud-stack.sh` sie
   („Supabase-Stack ohne Docker"), mit nachgebildeter Storage-API.
2. **Hinter der Anmeldung** laufen 21 Spezifikationen im Playwright-Projekt
   `authenticated`; die Breite der Prüfung liegt bei `pnpm test:db`.
3. **Der Secret-Scan prüft nur den aktuellen Stand**, nicht die Git-Historie.
   GitHub Secret Scanning und Push Protection sollten zusätzlich in den
   Repository-Einstellungen aktiviert werden.
4. **Die statische Sicherheitsanalyse ist `eslint-plugin-security`** — sinnvoll
   für JavaScript/TypeScript, aber kein vollwertiges SAST. Eine Erweiterung ist
   offen.
5. **Kein Offline-Modus und kein Service Worker** (ADR-015, ADR-001).
6. **Abgewiesene Schreibzugriffe werden nicht persistiert.** Eine Abweisung
   per Ausnahme rollt die Transaktion und damit auch ihren Protokolleintrag
   zurück. Die Lesepfade weisen deshalb seit OPS-004, G6a und G6b mit null
   Zeilen ab und schreiben über `app.record_denied_read` `outcome = 'denied'`;
   für die Schreibpfade gilt seit G6c (2026-09-26): bestätigte Transaktion mit
   HTTP 403 über `app.record_denied_write` für Rollen und Konten, Legal Hold und
   Löschaufträge, ohne Eintrag für den Rest (ANN-115). Die echte HTTP-Antwort
   über PostgREST ist nur lokal mit `supabase start` zu sehen.
7. **Kein Audit-Report und keine Alarmierung** — gewollt: ADR-010 Fassung 3
   wertet bei Anlass aus. Der Katalog hat 27 Aktionen
   (`supabase/audit-aktionen.txt`); eine Änderung braucht das Label
   `freigabe-audit` (LOG-EPIC-001).
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

- Branch Protection auf `main` (Kriterium von M3): erforderliche Checks unter ihren
  Anzeigenamen „Lint, Typecheck, Tests, Build" (`quality`), „Migrationen und
  RLS-Policies" (`database`), „Secret Scanning und Dependency Audit"
  (`security`), „End-to-End" (`e2e`), „End-to-End hinter der Anmeldung"
  (`e2e-supabase`) und „Aktionen des Auditlogs unveraendert oder freigegeben"
  (`audit-katalog.yml`, LOG-EPIC-001); Force Push und Deletions aus; keine
  Pflicht-Approvals (ADR-013).
- Das Label `freigabe-audit` anlegen. Es setzt nur Jannes; die Prüfung erkennt
  die Freigabe nur, wenn der Inhaber des Repositorys es zuletzt gesetzt hat.
- GitHub Secret Scanning und Push Protection aktivieren.
- Gemergte Branches automatisch löschen („Automatically delete head
  branches"). „Allow auto-merge" entfällt — auf diesem GitHub-Plan nicht
  verfügbar; Jannes mergt nach grüner CI (Roadmap, „Definition of Done").
- Dependabot oder eine vergleichbare Aktualisierung der Abhängigkeiten.
- **Die Supabase-CLI-Version in `.github/workflows/ci.yml` von Hand erhöhen.**
  Sie steht dort fest statt auf `latest`, weil `latest` die Action bei jedem
  Lauf die GitHub-API nach dem neuesten Release fragen lässt — ein Aufruf ohne
  Token, der am 2026-09-05 ins Rate Limit lief und den `main`-Lauf umbrachte,
  bevor ein einziger Test lief. Eine feste Version macht das Gate zusätzlich
  reproduzierbar (ADR-013). Die aktuelle Version steht auf
  <https://www.npmjs.com/package/supabase>.
