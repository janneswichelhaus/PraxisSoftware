# CLAUDE.md

Praxisplattform für eine privat abrechnende Physiotherapiepraxis mit Hausbesuchen per Lastenrad.
Verarbeitet Gesundheitsdaten. Hauptgerät: Smartphone in der Halterung, 375 px zuerst. Früher
Entwicklungsstand, kein Produktivbetrieb.

**Zuerst lesen:** `docs/STATUS.md`. Start: `/weiter`, `/bereich <Bereich>`,
`/feature-loop <Auftrag>`, `/idee <Text>`, `/sichtung`.

## Rangfolge

`PROJECT_PRINCIPLES.md` §21: **1** Prinzipien · **2** geltende ADRs · **3** Spezifikation des
Auftrags (diese drei verbindlich) · **4** `docs/decisions/ASSUMPTIONS.md` (vorläufig) · **5**
`docs/PRODUCT_VISION.md` · **6** `docs/product/` (5 und 6 begründen nie Scope). Ohne Rang:
`OPEN_DECISIONS.md`, STATUS, `docs/development/` (die Roadmap ordnet, begründet nie Scope). Ein
ADR überschreibt die Prinzipien nicht.
Widersprüche nach Rang auflösen und als Annahme festhalten; stoppen nur bei gleichem Rang **und**
teurer Rücknahme. ADRs nur laden, wenn der Index sie nennt, dann ganz.

## Annahmen statt Rückfragen

Fehlt eine Festlegung zu Datenschutz, Recht, Praxisprozess oder Technik: recherchieren,
entscheiden, als `ANN-NNN` eintragen (≤ 1 KB), an genau einer Codestelle reversibel verankern
(§15.1). **Stopp nur** bei: Widerspruch zu einer MUSS-Anforderung; Aufweichen einer
Sicherheitsmaßnahme, eines Tests oder Gates; echten Daten, Produktionscredentials, Secrets,
Deployment, neuen Anbietern; Entscheidungen mit großem Umbau bei Rücknahme. Dann mit Optionen,
Empfehlung, Konsequenzen fragen und alles Unabhängige vorher fertigstellen. **Bauen wartet nie auf
eine Antwort von außen** (§15.2): Offene Klärungen blockieren das Scharfschalten, nicht die
Entwicklung mit synthetischen Daten; eine Spec, die den Baubeginn an eine externe Antwort bindet,
wird neu geschnitten.

## ADR-Index (`docs/adr/`)

001 Offline, Sync, Finalisierung · 002 Hosting, Datenstandort, Anbieter, Logziele · 003
`organization_id`/`location_id` · 004 Rollen, Policies, RLS, Projektionen · 005 KI, AI Gateway ·
006 MDR, Red Flags · 007 DSFA, Go-live · 008 Aufbewahrung, Löschung, Legal Hold · 009 Abrechnung,
Zahlungen · 010 Audit, privilegierter Zugriff · 011 Logging, Redaction · 012 Backup, Restore ·
013 CI-Gates, Review-Checkliste · 014 Datenmodell: UUIDs, Zeit, Geld · 015 Stack, Ordner · 016
Doku: Entwurf, Finalisierung · 017 Dateien, Fotos · 018 Terminzustände, Ausfallhonorar · 019
Karte, Navigation, §203-Gate · 020 Verordnung, Selbstzahler · 021 Behandlung/Training getrennt ·
022 Terminkontext, Trainingsprotokoll · 023 Plattformzugang, Vertretung · 024 Service Worker,
Push, Mail · 025 Sitzungssperre, Passkey · 026 Virenprüfung (abgelehnt) · 027 Ernährungsberatung.

## Repository und Befehle

Modularer Monolith (ADR-015): `src/features/<domäne>/`, keine Microservices, keine
Clean-Architecture-Schichten. `marke/` ist die einzige Quelle für Wortmarke und App-Symbole,
byte-gleich in `public/marke/` (`src/marke.test.ts`); keine zweite Fassung, kein Umfärben. pnpm,
nicht npm/yarn; neuer Code englisch (`docs/DEVELOPMENT.md`).

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check
```

Je nach Änderung `pnpm test:db` (Datenbank, Policies), `pnpm test:e2e`, `pnpm scan:secrets`,
`pnpm build`.

## Cloud-Umgebung

- `supabase start` geht nicht; stattdessen `./scripts/cloud-stack.sh start` (ohne Docker, schreibt
  `.env.development.local`), dann `pnpm dev`, `pnpm screenshots`/`pnpm bildstrecke`,
  `pnpm test:e2e --project authenticated` mit `.env.development.local`; vor E2E `reset` ohne
  `--reich` (`docs/DEVELOPMENT.md`).
- **`pnpm test:db` nie überspringen:** `pnpm db:start`,
  `export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres` und `pnpm test:db` in
  **einem** Aufruf; `ECONNREFUSED 127.0.0.1:54329` ist kein Testfehler.
- `node_modules` und `PLAYWRIGHT_CHROMIUM_EXECUTABLE` setzt `.claude/hooks/session-start.sh`.

## Harte Regeln

- **Keine echten Patientendaten** — nirgends, auch nicht auf Bildschirmfotos fremder Software.
- **Keine Produktionscredentials** für Coding- oder KI-Werkzeuge. **Keine Secrets im Repository.**
  `.env*` außer `.env.example` bleibt ungetrackt.
- **Autorisierung niemals nur über die UI.** Ausgeblendetes ist keine Zugriffskontrolle; RLS bleibt
  Defense-in-Depth (ADR-004).
- **Security-, RLS- und Datenschutztests werden nie entfernt, deaktiviert oder abgeschwächt**, um
  grün zu werden; ebenso Secret-Scanning und die übrigen CI-Gates. Geht ein Gate nur durch
  Abschwächung: stoppen und berichten.
- **Protokollierung (ADR-010):** Das Datenmodell ist der Nachweis; ins Auditlog nur dessen Liste.
  Neue Protokollierung nur mit ADR-Änderung und Jannes' Freigabe (Label `freigabe-audit`, nur er).
  Zweck nur Datenschutz/Sicherheit, nie Leistungs- oder Verhaltenskontrolle. Betriebslogs: ADR-011.
- **Keine neuen Provider, Frameworks oder wesentlichen Dependencies** ohne fachliche Notwendigkeit
  und Prüfung gegen die ADRs.
- **Keine ungefragten Refactorings** außerhalb der berührten Module; Auffälliges wird
  vorgeschlagen. Keine Zukunftsfeatures prophylaktisch (ADR-014). Sicherheits- und
  Compliance-Mechanismen über die Anforderung hinaus nur vorschlagen.
- **Kein Produktionsdeployment durch Coding-Agenten** (ADR-013), keine Cloud-Ressourcen ohne Auftrag.
- **Jede Änderung objektiv überprüfbar** (Test oder andere Verifikation). Nichts als gelaufen
  melden, was nicht lief. Datenbank- oder Berechtigungsänderungen brauchen `pnpm test:db`.
- **UI-Änderungen in der laufenden Anwendung ansehen** (Chromium/Playwright), mobil bei ~375 px.

## Arbeitsweise

- **K1 zuerst:** Berührt der Diff einen Auslöser aus ADR-013 Punkt 9 (Liste nur dort), ist er
  **Pfad A**: Review-Checkliste je Punkt im Bericht, gezielt `pnpm test:db`, Zweitreview in frischem
  Kontext vor dem Merge, wo Nr. 8 es verlangt (`.claude/agents/sicherheits-reviewer.md`); Session
  mit `/effort xhigh`. Sonst gelten die Standardprüfungen.
- **Aufträge vollständig abarbeiten.** Ein Auftrag (Bereich oder Liste von Epics) läuft ohne
  Zwischenstopp; ein Commit je Story. Anhalten nur bei der Stoppliste oben, nach drei erfolglosen
  Reparaturversuchen derselben Ursache (markieren, Unabhängiges weiterbauen) oder bei vollem
  Kontext (dann übergeben). Fragen gesammelt am Ende, höchstens fünf, je mit Empfehlung.
- **`/bereich` ist der Standard** für große Bereichsüberholungen; `/feature-loop` für
  Einzelaufträge an Datenmodell oder Rechten. Vorher `git fetch origin --prune`, Branches, offene
  PRs: nichts doppelt bauen. An Vorschaubereichen `docs/development/ARBEITSBEREICHE.md`.
- **Oberfläche nur nach `docs/design/DESIGN.md`.** Ein Auftrag zu einem Bereich beauftragt die
  Angleichung **aller** Seiten dieses Bereichs.
- **Selbstsichtung ist Pflicht bei UI:** Cloud-Stack und `pnpm bildstrecke` (vorher/nachher, 375
  und 1280 px), Bilder selbst ansehen, in die PR.
- **Startinhalte gehören zum Lieferumfang:** Bibliotheken, Vorlagen, Textbausteine,
  Preisblatt-Entwürfe — Inhalt, kein vorgebautes Datenmodell.
- **Referenzabgleich:** Nennt Jannes' Auftrag einen Bereich, ist der Abgleich mit Praxissoftware
  Spezifikationsquelle — Abläufe und Schrittzahlen, nie Texte, Bilder, Symbole. Maßstab:
  `docs/product/kernablaeufe.md`.
- **Subagenten und Workflows** für Recherche, Review (`.claude/agents/`) und parallele
  Oberflächenarbeit in Worktrees; Fundament (Migration, RLS) seriell.
- **Doku je PR, nur vier Dinge:** PR-Beschreibung (Spec, Prüfungen, Checkliste, Bilder, Fragen),
  kurze Annahmen mit Anker, `fortschritt.json` (`pnpm fortschritt --schreiben`), STATUS in drei
  Zeilen. Befunde in `docs/development/BEFUNDE.md`; Ideen außerhalb des Auftrags nach
  `docs/product/` (`/idee`), nicht in den Code.
- **Gemessen** wird die Software auf synthetischen Daten und Jannes' eigene Zeit, nie Mitarbeitende
  und nie per Telemetrie (§20). Merge bleibt bei Jannes.
- **Bericht:** PR-Link, neue Annahmen je ein Satz, Fragen, Vorschlag für den nächsten Auftrag.
  Lokale Schritte (`git pull`, `pnpm install`, `db reset`) nur als Fußnote.
