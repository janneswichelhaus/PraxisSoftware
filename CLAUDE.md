# CLAUDE.md

Praxisplattform für eine privat abrechnende Physiotherapiepraxis. Verarbeitet
Gesundheitsdaten. Früher Entwicklungsstand, kein Produktivbetrieb.

## Verbindliche Grundlagen

Dokumentenhierarchie — bei Konflikten gilt der höhere Rang:

1. `PROJECT_PRINCIPLES.md` (aktuell v0.6) — übergeordnete Leitplanken
2. geltende ADRs in `docs/adr/` — konkretisieren die Leitplanken
3. die konkrete Feature-Spezifikation — verbindlich für ihre Aufgabe
4. `docs/decisions/ASSUMPTIONS.md` — begründete, **vorläufige** Annahmen;
   füllen Lücken der Ränge 1 bis 3, überschreiben sie nie
5. `docs/PRODUCT_VISION.md` — **nicht normativ**
6. `docs/product/` (Ideenspeicher) — **nicht normativ**, schwächste Ebene

- Die Ränge 1 bis 3 sind verbindlich. Rang 4 gilt, bis er bestätigt, geändert
  oder verworfen wird.
- **Ein ADR überschreibt `PROJECT_PRINCIPLES.md` nicht** — auch kein neuerer.
  Soll eine Leitplanke geändert werden, MUSS das Prinzip ausdrücklich
  aktualisiert und die Änderung nachvollziehbar dokumentiert werden (§21).
- **Ein neuer ADR kann einen älteren ausdrücklich ersetzen** (Status „abgelöst
  durch ADR-XXX"). Vorrang gilt nur zwischen ADRs, nie gegenüber Rang 1.
- Eine Feature-Spezifikation überschreibt weder Prinzipien noch ADRs.
- **Widersprüche nach Rang auflösen, nicht abwarten.** Widersprechen sich zwei
  Dokumente, gilt das höhere; die Auflösung wird als Annahme registriert und
  im Bericht gemeldet (§21). Stoppen nur, wenn beide Lesarten dem Rang nach
  gleichwertig sind **und** die Wahl später teuer zurückzunehmen wäre.
- **Nicht bei jeder Aufgabe alle ADRs laden.** Der Index unten sagt, welcher
  ADR wofür zuständig ist; nur die relevanten vollständig lesen.
- `docs/decisions/OPEN_DECISIONS.md` listet, was noch offen ist. **Ein
  offener Punkt blockiert keine Aufgabe**: recherchieren, Annahme treffen,
  registrieren, weiterarbeiten. Der Punkt bleibt offen, bis Jannes oder die
  Datenschutzprüfung ihn bestätigt.
- `docs/PRODUCT_VISION.md` beschreibt das langfristige Zielbild und steht an
  vorletzter Stelle. **Es ist nicht normativ**: kein Implementierungsauftrag,
  keine Feature-Spezifikation, keine Freigabe. Es begründet **niemals** eine
  Erweiterung des aktuellen Feature-Scopes und überschreibt weder Prinzipien
  noch ADRs. Nützlich, um lokale Entscheidungen einzuordnen — nicht, um sie zu
  begründen.
- `docs/product/IDEENSPEICHER.md` sammelt Funktionsideen für später. **Rang 6,
  die schwächste Ebene.** Regeln dort; die drei wichtigsten: begründet nie eine
  Implementierung, im SPEC-Schritt nur die **eine** passende Bereichsdatei
  lesen, und ein Hinweis von dort, der Mehrarbeit oder eine Entscheidung
  bedeuten würde, wird als offene Frage berichtet statt umgesetzt.

## Annahmen statt Rückfragen

Jannes ist Physiotherapeut, kein Jurist und kein Datenschutzexperte. Eine
Rückfrage zu Aufbewahrungsfristen, Rechtsgrundlagen oder Auditumfang blockiert,
ohne eine bessere Antwort zu liefern. Deshalb gilt `PROJECT_PRINCIPLES.md`
§15.1:

1. **Recherchieren** — erst die Projektdokumente, dann Primärquellen
   (Gesetzestext, Leitlinien der Aufsichtsbehörden, Berufsverbände), dann
   Sekundärquellen. Websuche ist dafür da. Unbelegtes als unsicher benennen.
2. **Entscheiden** — nach bestem Wissen; im Zweifel die datensparsamere, die
   restriktivere, die leichter umkehrbare Option (§16).
3. **Dokumentieren** — jede Annahme als `ANN-NNN` in
   `docs/decisions/ASSUMPTIONS.md`: Annahme, Begründung mit Quellen,
   Verankerung, Änderungspfad mit Aufwand, Wiedervorlage.
4. **Reversibel verankern** — an genau einer Stelle im Code, und die trägt
   die Kennung im Kommentar. Wäre der Änderungsaufwand `groß`, vor dem Bauen
   nachfragen.
5. **Im Bericht nennen** — jede neue Annahme mit einem Satz, damit Jannes
   widersprechen kann, ohne den Code zu lesen.

Das gilt für Datenschutz, Recht, Praxisprozess-Details und Technik
gleichermaßen. Die Datenschutzprüfung vor Produktivstart arbeitet das Register
ab; jeder Eintrag sagt ihr vorab, was eine Änderung kostet.

**Was bleibt ein Stopp** (abschließende Liste, §15.1): Widerspruch zu einer
MUSS-Anforderung; Aufweichen einer Sicherheitsmaßnahme, eines Tests oder eines
Gates; alles rund um echte Daten, Produktionscredentials, Secrets, Deployment
oder neue Anbieter; Entscheidungen, deren Rücknahme einen großen Umbau
bedeuten würde. Dann die Frage so stellen, dass sie mit Optionen, Empfehlung
und Konsequenzen ohne Kontextwechsel beantwortbar ist — und alles, was nicht
davon abhängt, vorher fertigstellen.

## ADR-Index — welcher ADR wofür

| ADR | Lesen, wenn es um … geht                                                  |
| --- | ------------------------------------------------------------------------- |
| 001 | Offline-Verhalten, Synchronisation, Finalisierung von Dokumentation       |
| 002 | Hosting, Datenstandort, neue Dienstleister, Umgebungstrennung, Logziele   |
| 003 | `organization_id` / `location_id`, Mandantenfähigkeit                     |
| 004 | Rollen, Policies, RLS, Projektionen, Suche/Export/RAG-Berechtigungen      |
| 005 | KI-Anbindung, AI Gateway, Trennung LLM/Determinismus                      |
| 006 | MDR-Abgrenzung, Red Flags, Zweckbestimmung, `MDR_REVIEW_REQUIRED`         |
| 007 | DSFA, Datenschutzprozess, Go-live-Vorbedingungen                          |
| 008 | Aufbewahrung, Löschung, Retention Schedule, Legal Hold, Backups           |
| 009 | Abrechnung, Leistungen, Rechnungszustände, Snapshots, Zahlungen           |
| 010 | Audit-Ereignisse, Audit-Lesepfad, privilegierter Produktionszugriff       |
| 011 | Logging, Observability, Redaction, Log-Retention                          |
| 012 | Backup/Restore, RPO/RTO, Degraded-Betrieb, Betriebsdokumentation          |
| 013 | CI-Gates, Branch Protection, Release-Freigabe                             |
| 014 | Datenmodell-Fundament: UUIDs, Zeitstempel, Geldwerte, Rollen, Trennung    |
| 015 | Stack, Ordnerstruktur, Abgrenzungen (kein Next.js, kein Service Worker …) |
| 016 | Dokumentation: Entwurf/Finalisierung, Versionierung, wer ändern darf      |

## Repository

```
src/app  src/components  src/features  src/lib  src/routes
supabase/migrations  supabase/tests  supabase/seed.sql
tests/e2e  scripts  docs/adr  docs/decisions  docs/development  docs/product  docs/abnahme
```

Feature-Code liegt fachlich unter `src/features/<domäne>/`. Modularer Monolith
nach ADR-015 — keine Microservices, keine Clean-Architecture-Schichten.

## Befehle

```bash
pnpm install            # pnpm, nicht npm/yarn
pnpm dev                # Vite auf :5173
pnpm format:check       # Prettier - eigenes CI-Gate, nicht Teil von lint
pnpm lint               # ESLint inkl. eslint-plugin-security
pnpm typecheck
pnpm test               # Unit/Komponenten (Vitest + Testing Library)
pnpm test:db            # Migrationen + RLS gegen echtes PostgreSQL
pnpm test:e2e           # Playwright
pnpm scan:secrets
pnpm build
```

## Umgebung

- `pnpm db:start` startet eine lokale Wegwerf-Datenbank; danach
  `export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres`.
  **Der Cluster überlebt einen Werkzeugaufruf nicht zuverlässig.** Ein
  `ECONNREFUSED 127.0.0.1:54329` ist deshalb kein Testfehler: `db:start`,
  `export` und `test:db` in **einem** Aufruf ausführen.
- Migrations- und RLS-Tests laufen bewusst gegen PostgreSQL mit dem Shim in
  `supabase/tests/helpers/`, nicht gegen den vollen Supabase-Stack.
- **In der Cloud-/Remote-Umgebung ist `supabase start` nicht möglich** —
  Container-Images werden vom Egress-Proxy blockiert (403). Damit gibt es dort
  kein GoTrue und kein E2E hinter der Anmeldung. Auf einem lokalen Rechner mit
  Docker funktioniert der Stack; Vorgehen in `docs/DEVELOPMENT.md`.
- **`pnpm test:db` läuft trotzdem auch in der Cloud** und ist dort das
  wichtigste Gate. `scripts/test-db.sh` braucht kein Docker, sondern ein
  lokales PostgreSQL-Binär, das in der Cloudumgebung vorhanden ist (geprüft am
  2026-09-01: 495 Tests, 45 s). Migrations- und RLS-Arbeit ist hier also
  vollständig verifizierbar — **nicht wegen `supabase start` überspringen.**
- **In einer frischen Session fehlt `node_modules`.** Vor dem ersten Check
  einmal `pnpm install` — sonst schlägt der erste Lauf mit einer irreführenden
  Meldung über ein fehlendes Prettier-Plugin fehl.
- Playwright nutzt den vorinstallierten Browser über
  `export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`.
- Details und Go-live-Blocker: `docs/DEVELOPMENT.md`.

## Harte Regeln

Sicherheit und Datenschutz:

- **Keine echten Patientendaten** — nirgends. Nur synthetische Daten.
- **Keine Produktionscredentials** für Coding- oder KI-Werkzeuge.
- **Keine Secrets im Repository.** `.env*` außer `.env.example` bleibt ungetrackt.
- **Autorisierung niemals nur über die UI.** Ausgeblendete Elemente sind keine
  Zugriffskontrolle. RLS bleibt Defense-in-Depth (ADR-004).
- **Security-, RLS- und Datenschutztests werden niemals entfernt, deaktiviert
  oder abgeschwächt, um einen Build grün zu bekommen.** Dasselbe gilt für
  Secret-Scanning und die übrigen CI-Gates. Wenn ein Gate nur durch
  Abschwächung erfüllbar wäre: stoppen und berichten.
- Keine patientenbezogenen Daten in Logs (ADR-011).

Umfang und Abhängigkeiten:

- **Keine neuen Provider, Frameworks oder wesentlichen Dependencies** ohne
  fachliche Notwendigkeit und Prüfung gegen die ADRs.
- **Keine ungefragten Refactorings** außerhalb der vom Auftrag berührten
  Module. Was der Auftrag braucht, gehört dazu; was nur auffällt, wird
  vorgeschlagen.
- Keine Zukunftsfeatures prophylaktisch bauen (ADR-014).
- **Kein Produktionsdeployment durch Coding-Agenten** (ADR-013). Keine
  Cloud-Ressourcen ohne expliziten Auftrag.

Verifikation:

- **Jede Änderung muss durch Tests oder eine andere objektive Verifikation
  überprüfbar sein.** Keine Prüfung als erfolgreich melden, die nicht
  tatsächlich gelaufen ist.
- Datenbank- oder Berechtigungsänderungen brauchen `pnpm test:db`.
- **Bei UI-Änderungen die laufende Anwendung visuell prüfen**, soweit technisch
  möglich (Chromium/Playwright), bei mobilrelevanten Features auch bei ~375 px.

## Arbeitsweise

Für Featurearbeit gibt es den Skill **`/feature-loop <Aufgabe>`**
(`.claude/skills/feature-loop/SKILL.md`): Spec → Inspect → Plan → Build →
Verify → Review → Fix → Final Verify → Report → Stopp. Er startet nur auf
ausdrücklichen Aufruf.

`docs/development/ROADMAP.md` sagt, **was als Nächstes** dran ist, welche
Entscheidung ein Etappenschritt voraussetzt und welche Regeln den
Credit-Verbrauch begrenzen. Zu Beginn eines Loops lesen und am Ende den
Eintrag abhaken. Die Roadmap legt die **Reihenfolge** fest, nie den Scope —
und startet nichts von allein.

**Ein Loop ist ein Epic**, nicht eine Story: mehrere zusammengehörige
vertikale Schnitte, Story für Story gebaut und je Story committet, ohne
Zwischenstopp und ohne Zwischenbericht. Zum Epic gehört alles, was seine
Akzeptanzkriterien brauchen — Seed, Testkonten, Audit-Ereignisse,
Abnahmeschritte in `docs/abnahme/`, Registereinträge. Was ein anderes
Epic wäre, wird am Ende vorgeschlagen, nicht gebaut.

**Vor jedem Loop den Gesamtstand prüfen, nicht nur `main`.** Erst
`git fetch origin --prune` und `git branch -r`, dazu die offenen Pull Requests.
Ein Branch, der `main` voraus ist, enthält Arbeit, die zählt: nichts neu bauen,
was dort schon liegt, und das nächste Epic nur auf dem Gesamtstand
vorschlagen. Unveröffentlichte Arbeit im Bericht nennen.

Hintergrund und Begründung: `docs/development/DEVELOPMENT_WORKFLOW.md`.

Welche Bereiche der Oberfläche echt angebunden sind, welche als gekennzeichnete
Vorschau laufen und wo eine Entscheidung aussteht, steht in
`docs/development/ARBEITSBEREICHE.md`. **Vor Arbeit an einem Vorschaubereich
diese Liste lesen** — sonst entsteht leicht eine zweite Implementierung neben
einer bereits vorhandenen.

Für die Optimierung eines Bereichs gibt es **Ablaufrunden** — Docs-Sessions
ohne Code nach `docs/development/OPTIMIERUNG.md`. Eine Runde misst Abläufe,
benennt Bruchstellen und schreibt **Akzeptanzhinweise in bestehende
Roadmap-Zeilen** oder höchstens ein neues Epic. Sie führt keine zweite
Reihenfolge und begründet keinen Scope; verbindlich wird ein Hinweis erst im
SPEC-Schritt des Loops. Ablaufkarten unter `docs/development/ablaeufe/`
entstehen nur in der Runde ihres Bereichs; ein Loop liest sie nicht. Gemessen
wird nur durch Jannes selbst, nie an Mitarbeitenden und nie per Telemetrie
(§20).

Kleine Commits mit aussagekräftiger Nachricht, einer je Story. Nach
abgeschlossenem Epic stoppen und berichten — mit allen neuen Annahmen und
einem Vorschlag für das nächste Epic. Das nächste Epic nicht eigenständig
beginnen.

Bringt Jannes im Gespräch eine Funktionsidee ein, die nicht zum aktuellen
Auftrag gehört, oder entsteht eine im Loop: **in `docs/product/` eintragen,
nicht bauen.** Das gilt auch für gute Ideen — besonders für die.

Jannes (Projektinhaber) schaut sich Ergebnisse lokal auf seinem eigenen
Rechner an, nicht nur über Tests. **Nach jeder abgeschlossenen Änderung kurz
die Schritte nennen, mit denen er seinen lokalen Stand aktualisiert**,
mindestens `git pull origin <branch>`; zusätzlich `pnpm install` bei
geänderten Abhängigkeiten und `pnpm dlx supabase db reset`, wenn sich
Migrationen oder `supabase/seed.sql` geändert haben. Das gilt auch bei
kleinen Zwischen-Fixes, nicht nur am Ende eines ganzen Epics.
