# CLAUDE.md

Praxisplattform für eine privat abrechnende Physiotherapiepraxis. Verarbeitet Gesundheitsdaten.
Früher Entwicklungsstand, kein Produktivbetrieb.

**Zuerst lesen:** `docs/STATUS.md` — was jetzt läuft, was danach kommt, was bei Jannes liegt.
Startprompt jeder Session: `docs/development/SESSION-START.md`.

## Verbindliche Grundlagen

Rangfolge bei Konflikten (`PROJECT_PRINCIPLES.md` §21) — **1** `PROJECT_PRINCIPLES.md` · **2**
geltende ADRs in `docs/adr/` · **3** die Feature-Spezifikation (diese drei sind verbindlich) · **4**
`docs/decisions/ASSUMPTIONS.md` (vorläufig, überschreibt nie) · **5** `docs/PRODUCT_VISION.md` ·
**6** `docs/product/` (Ideenspeicher, Regeln dort; 5 und 6 sind nicht normativ und begründen
**niemals** Scope). `docs/decisions/OPEN_DECISIONS.md` und `docs/development/` **haben keinen
Rang**; ein offener Punkt blockiert keine Aufgabe.

- **Ein ADR überschreibt `PROJECT_PRINCIPLES.md` nicht**; ein neuer ADR kann einen älteren
  ausdrücklich ablösen. Leitplanken ändern sich nur dort (§21).
- **Widersprüche nach Rang auflösen, nicht abwarten**, und als Annahme registrieren. Stoppen nur
  bei gleichem Rang **und** teurer Rücknahme.
- **Nicht alle ADRs laden** — nur die, die der Index nennt, dann vollständig.

## Annahmen statt Rückfragen

Jannes ist Physiotherapeut, kein Jurist und kein Datenschutzexperte. Fehlt eine Festlegung zu
Datenschutz, Recht, Praxisprozess oder Technik, gilt `PROJECT_PRINCIPLES.md` §15.1: recherchieren,
entscheiden, als `ANN-NNN` im Register dokumentieren, an genau einer Codestelle reversibel verankern.

**Was bleibt ein Stopp** (abschließende Liste, §15.1): Widerspruch zu einer MUSS-Anforderung;
Aufweichen einer Sicherheitsmaßnahme, eines Tests oder eines Gates; alles rund um echte Daten,
Produktionscredentials, Secrets, Deployment oder neue Anbieter; Entscheidungen, deren Rücknahme
einen großen Umbau bedeuten würde. Dann mit Optionen, Empfehlung und Konsequenzen fragen, ohne
Kontextwechsel beantwortbar — und alles, was nicht davon abhängt, vorher fertigstellen.

**Bauen wartet nie auf eine Antwort von außen** (§15.2, seit 2026-09-22). Datenschutzberatung,
Steuerberatung, Anbietervertrag, Aufsicht: Eine offene Klärung blockiert das **Scharfschalten** —
echte Daten, produktive Anbieternutzung, Inbetriebnahme —, nie die Entwicklung mit synthetischen
Daten. Eine Spezifikation, die einen Baubeginn an eine externe Antwort bindet, ist **neu zu
schneiden**. Der Preis: Jede so getragene Annahme **muss** an genau einer Stelle reversibel
verankert sein — sonst wird aus schnellem Bauen späterer Umbau.

## ADR-Index — welcher ADR wofür

| ADR | Lesen, wenn es um … geht                                                    |
| --- | --------------------------------------------------------------------------- |
| 001 | Offline-Verhalten, Synchronisation, Finalisierung von Dokumentation         |
| 002 | Hosting, Datenstandort, neue Dienstleister, Umgebungstrennung, Logziele     |
| 003 | `organization_id` / `location_id`, Mandantenfähigkeit                       |
| 004 | Rollen, Policies, RLS, Projektionen, Suche/Export/RAG-Berechtigungen        |
| 005 | KI-Anbindung, AI Gateway, Trennung LLM/Determinismus                        |
| 006 | MDR-Abgrenzung, Red Flags, Zweckbestimmung, `MDR_REVIEW_REQUIRED`           |
| 007 | DSFA, Datenschutzprozess, Go-live-Vorbedingungen                            |
| 008 | Aufbewahrung, Löschung, Retention Schedule, Legal Hold, Backups             |
| 009 | Abrechnung, Leistungen, Rechnungszustände, Snapshots, Zahlungen             |
| 010 | Audit-Ereignisse, Audit-Lesepfad, privilegierter Produktionszugriff         |
| 011 | Logging, Observability, Redaction, Log-Retention                            |
| 012 | Backup/Restore, RPO/RTO, Degraded-Betrieb, Betriebsdokumentation            |
| 013 | CI-Gates, Branch Protection, Release-Freigabe                               |
| 014 | Datenmodell-Fundament: UUIDs, Zeitstempel, Geldwerte, Rollen, Trennung      |
| 015 | Stack, Ordnerstruktur, Abgrenzungen (kein Next.js, kein Service Worker …)   |
| 016 | Dokumentation: Entwurf/Finalisierung, Versionierung, wer ändern darf        |
| 017 | Dateien: Ablageort, Dokumentart, signierte Verweise, Löschung, Virenprüfung |
| 018 | Terminzustände, Übergänge, Ausfallhonorar-Kennzeichen, Terminserie          |
| 019 | Kartendienst, Navigations-Handoff, Fahrzeiten, Vertrags-/§203-Gate          |
| 020 | Behandlungsgrundlage: Verordnung und Selbstzahler, Kontingent, Gruppierung  |
| 021 | Behandlung und Training getrennt, Rechtsverhältnis, Trainingsdaten, §203    |
| 022 | Terminkontext, Trainingsgrundlage, Trainingsprotokoll, ein Kalender         |

## Repository

Modularer Monolith nach ADR-015: Feature-Code fachlich unter `src/features/<domäne>/`, keine
Microservices, keine Clean-Architecture-Schichten. Verzeichnisse: `README.md`, „Struktur".

`marke/` ist die **einzige Quelle** für Wortmarke und App-Symbole (`marke/README.md`); ausgeliefert
über byte-gleiche Kopien in `public/marke/`, die `src/marke.test.ts` festhält. Keine zweite Fassung,
kein Umfärben.

## Befehle

pnpm, nicht npm/yarn. Erklärungen in `docs/DEVELOPMENT.md`.

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check
```

Dazu je nach Änderung `pnpm test:db` (Datenbank, Policies), `pnpm test:e2e`, `pnpm scan:secrets`;
im Alltag `pnpm install`, `pnpm dev`, `pnpm build`.

## Cloud-Umgebung

- **`supabase start` ist dort nicht möglich** (Egress-Proxy blockiert Container-Images, 403): kein
  GoTrue, kein E2E hinter der Anmeldung.
- **`pnpm test:db` läuft trotzdem** (lokales PostgreSQL-Binär, kein Docker) und ist dort das
  wichtigste Gate — **nicht wegen `supabase start` überspringen.** Der Cluster überlebt einen
  Werkzeugaufruf nicht zuverlässig: `pnpm db:start`,
  `export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres` und `pnpm test:db` in
  **einem** Aufruf; `ECONNREFUSED 127.0.0.1:54329` ist kein Testfehler.
- `node_modules` und `PLAYWRIGHT_CHROMIUM_EXECUTABLE` setzt der SessionStart-Hook
  (`.claude/hooks/session-start.sh`).

## Harte Regeln

- **Keine echten Patientendaten** — nirgends. Nur synthetische Daten. Das gilt auch für
  Bildschirmfotos aus fremder Software.
- **Keine Produktionscredentials** für Coding- oder KI-Werkzeuge.
- **Keine Secrets im Repository.** `.env*` außer `.env.example` bleibt ungetrackt.
- **Autorisierung niemals nur über die UI.** Ausgeblendete Elemente sind keine Zugriffskontrolle.
  RLS bleibt Defense-in-Depth (ADR-004).
- **Security-, RLS- und Datenschutztests werden niemals entfernt, deaktiviert oder abgeschwächt, um
  einen Build grün zu bekommen.** Dasselbe gilt für Secret-Scanning und die übrigen CI-Gates. Wenn
  ein Gate nur durch Abschwächung erfüllbar wäre: stoppen und berichten.
- Keine patientenbezogenen Daten in Logs (ADR-011).
- **Keine neuen Provider, Frameworks oder wesentlichen Dependencies** ohne fachliche Notwendigkeit
  und Prüfung gegen die ADRs.
- **Keine ungefragten Refactorings** außerhalb der berührten Module; was nur auffällt, wird
  vorgeschlagen. Keine Zukunftsfeatures prophylaktisch bauen (ADR-014).
- **Kein Produktionsdeployment durch Coding-Agenten** (ADR-013), keine Cloud-Ressourcen ohne Auftrag.
- **Jede Änderung muss durch Tests oder eine andere objektive Verifikation überprüfbar sein.** Keine
  Prüfung als erfolgreich melden, die nicht tatsächlich gelaufen ist. Datenbank- oder
  Berechtigungsänderungen brauchen `pnpm test:db`.
- **Bei UI-Änderungen die laufende Anwendung visuell prüfen**, soweit technisch möglich
  (Chromium/Playwright), bei mobilrelevanten Features auch bei ~375 px.

## Arbeitsweise

**Jeder Auftrag wird zuerst klassifiziert** (K1 in `docs/development/GRAPH-ENGINEERING-WORKFLOW.md`):
Berührt der Diff einen Auslöser aus ADR-013 Punkt 9, ist er **Pfad A** —
`/feature-loop <Aufgabe>`. Berührt er nur die Oberfläche und überlebt kein Wert die Sitzung, ist er
**Pfad S** — `/sandbox <Thema>`. Beide Skills (`.claude/skills/`) starten nur auf ausdrücklichen
Aufruf; Zuschnitt, Zweitreview und Bericht stehen dort.

- `docs/development/ROADMAP.md` legt die **Reihenfolge** fest, nie den Scope, und startet nichts von
  allein; `docs/STATUS.md` trägt davon den Livestand und wird in Skill-Schritt I nachgestellt. Merge
  und Abnahme: Roadmap, „Definition of Done".
- **Vor jedem Loop den Gesamtstand prüfen, nicht nur `main`:** `git fetch origin --prune`,
  `git branch -r`, offene Pull Requests. Nichts neu bauen, was auf einem Branch schon liegt;
  unveröffentlichte Arbeit im Bericht nennen.
- **Vor Arbeit an einem Vorschaubereich** `docs/development/ARBEITSBEREICHE.md` lesen — sonst
  entsteht eine zweite Implementierung neben einer vorhandenen.
- Befunde sammelt `docs/development/BEFUNDE.md`; Ablaufrunden regelt
  `docs/development/OPTIMIERUNG.md`. Gemessen wird nur durch Jannes selbst, nie an Mitarbeitenden
  und nie per Telemetrie (§20).
- Eine Funktionsidee außerhalb des Auftrags — von Jannes oder aus dem Loop — **kommt nach
  `docs/product/`, nicht in den Code.** Auch gute, besonders die.
- Kleine Commits, einer je Story. Nach dem Epic stoppen und berichten; das nächste nicht
  eigenständig beginnen.
- **Abschlussbericht:** neue Annahmen mit je einem Satz, Vorschlag für den nächsten Loop, lokale
  Update-Schritte für Jannes — mindestens `git pull origin <branch>`; `pnpm install` bei geänderten
  Abhängigkeiten; `pnpm dlx supabase@2.116.0 db reset` bei geänderten Migrationen oder Seed.
