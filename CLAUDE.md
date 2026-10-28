# CLAUDE.md

Praxisplattform einer privat abrechnenden Physiotherapiepraxis mit Hausbesuchen per Lastenrad;
verarbeitet Gesundheitsdaten. Hauptgerät: Smartphone in der Halterung, 375 px zuerst. Früher
Entwicklungsstand, kein Produktivbetrieb. **Zuerst lesen:** `docs/STATUS.md`. Start: `/weiter`,
`/bereich <Bereich>`, `/feature-loop <Auftrag>`, `/idee <Text>`, `/sichtung`, `/aufraeumen`.
**Rangfolge** nach `PROJECT_PRINCIPLES.md` §21: **1** Prinzipien · **2** geltende ADRs · **3**
Auftragsspezifikation (1 bis 3 verbindlich) · **4** `docs/decisions/ASSUMPTIONS.md` (vorläufig) ·
**5** `docs/PRODUCT_VISION.md` · **6** `docs/product/`; 5, 6 und die Roadmap begründen nie Scope,
ohne Rang sind `OPEN_DECISIONS.md`, STATUS und `docs/development/`. Widersprüche nach Rang auflösen
und als Annahme festhalten; stoppen nur bei gleichem Rang **und** teurer Rücknahme. ADRs nur laden,
wenn der Index sie nennt, dann ganz.

## Annahmen statt Rückfragen, ADR-Index

Fehlt eine fachliche oder architektonische Festlegung (Datenschutz, Recht, Praxisprozess,
Technik): recherchieren, entscheiden, als `ANN-NNN` eintragen (≤ 800 B), an genau einer Codestelle
reversibel verankern (§15.1). Werkzeug- und Linter-Details sind keine Annahme und kein ADR
(Skript, `docs/DEVELOPMENT.md`). **Stopp nur** bei Widerspruch zu einer MUSS-Anforderung,
Aufweichen von Sicherheitsmaßnahme, Test oder Gate, echten Daten, Produktionscredentials, Secrets,
Deployment, neuen Anbietern oder großem Umbau bei Rücknahme: dann mit Optionen, Empfehlung und
Konsequenzen fragen, Unabhängiges vorher fertigstellen. **Bauen wartet nie auf eine Antwort
von außen** (§15.2): Offene Klärungen blockieren das Scharfschalten, nicht das Bauen mit
synthetischen Daten; eine Spec, die das Bauen daran bindet, wird neu geschnitten.

**ADR-Index** (`docs/adr/`): 001 Offline, Sync, Finalisierung · 002 Hosting, Datenstandort,
Anbieter, Logziele · 003 `organization_id`/`location_id` · 004 Rollen, Policies, RLS, Projektionen ·
005 KI, AI Gateway · 006 MDR, Red Flags · 007 DSFA, Go-live · 008 Aufbewahrung, Löschung, Legal Hold
· 009 Abrechnung, Zahlungen · 010 Audit, privilegierter Zugriff · 011 Logging, Redaction · 012
Backup, Restore · 013 CI-Gates, Review-Checkliste · 014 Datenmodell: UUIDs, Zeit, Geld · 015 Stack,
Ordner · 016 Doku: Entwurf, Finalisierung · 017 Dateien, Fotos · 018 Terminzustände, Ausfallhonorar
· 019 Karte, Navigation, §203-Gate · 020 Verordnung, Selbstzahler · 021 Behandlung/Training getrennt
· 022 Terminkontext, Trainingsprotokoll · 023 Plattformzugang, Vertretung · 024 Service Worker,
Push, Mail · 025 Sitzungssperre, Passkey · 026 Virenprüfung (abgelehnt) · 027 Ernährungsberatung.

## Repository und Befehle

Modularer Monolith (ADR-015): `src/features/<domäne>/`, keine Microservices oder
Clean-Architecture-Schichten. `marke/` ist die einzige Quelle für Wortmarke und App-Symbole
(`src/marke.test.ts`), kein Umfärben. pnpm statt npm/yarn; neuer Code englisch; Kommentare
höchstens drei Zeilen, nur das Warum, ohne Tickets (`docs/DEVELOPMENT.md`).

```bash
pnpm format:check && pnpm lint && pnpm kommentare:check && pnpm typecheck && pnpm test && pnpm docs:check
```

Je nach Änderung `pnpm test:db` (Datenbank, Policies), `pnpm test:e2e`, `pnpm scan:secrets`,
`pnpm build`. **Cloud-Umgebung:** `./scripts/cloud-stack.sh start` statt `supabase start` (ohne
Docker); vor E2E `reset` ohne `--reich` (`docs/DEVELOPMENT.md`). **`pnpm test:db` nie überspringen:**
`pnpm db:start`, `export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres` und
`pnpm test:db` in **einem** Aufruf; `ECONNREFUSED` ist kein Testfehler.

## Harte Regeln

- **Keine echten Patientendaten**, nirgends, auch nicht auf Bildschirmfotos fremder Software.
- **Keine Produktionscredentials** für Coding- oder KI-Werkzeuge, **keine Secrets im Repository**;
  `.env*` außer `.env.example` bleibt ungetrackt.
- **Autorisierung nie nur über die UI**; RLS bleibt Defense-in-Depth (ADR-004).
- **Security-, RLS- und Datenschutztests, Secret-Scanning und CI-Gates** nie entfernen,
  deaktivieren oder abschwächen, um grün zu werden; geht es nur so: stoppen und berichten.
- **Protokollierung (ADR-010):** Das Datenmodell ist der Nachweis, ins Auditlog nur dessen Liste.
  Neue Protokollierung nur mit ADR-Änderung und Jannes' Label `freigabe-audit`; Zweck nur
  Datenschutz und Sicherheit, nie Leistungs- oder Verhaltenskontrolle. Betriebslogs: ADR-011.
- **Keine neuen Provider, Frameworks oder wesentlichen Dependencies** ohne fachliche Notwendigkeit
  und Prüfung gegen die ADRs.
- **Keine ungefragten Refactorings** außerhalb der berührten Module, keine Zukunftsfeatures
  (ADR-014); Auffälliges und zusätzliche Sicherheits- oder Compliance-Mechanismen nur vorschlagen.
- **Kein Produktionsdeployment durch Coding-Agenten** (ADR-013), keine Cloud-Ressourcen ohne Auftrag.
- **Jede Änderung objektiv überprüfbar**; nichts als gelaufen melden, was nicht lief.
- **UI selbst ansehen:** `pnpm bildstrecke` vorher und nachher bei 375 und 1280 px, Bilder
  prüfen und in die PR.

## Arbeitsweise

- **K1 zuerst:** Berührt der Diff einen Auslöser aus ADR-013 Punkt 9, gilt **Pfad A**: Checkliste
  je Punkt im Bericht, gezielt `pnpm test:db`, Zweitreview in frischem Kontext vor dem Merge, wo
  Nr. 8 es verlangt (`.claude/agents/sicherheits-reviewer.md`), `/effort xhigh`.
- **Aufträge ohne Zwischenstopp abarbeiten,** ein Commit je Story; anhalten nur bei der
  Stoppliste, nach drei erfolglosen Reparaturen derselben Ursache (markieren, Unabhängiges
  weiterbauen) oder bei vollem Kontext (übergeben). Fragen gesammelt am Ende, höchstens fünf, je
  mit Empfehlung.
- **`/bereich` ist der Standard** für Bereichsüberholungen, `/feature-loop` für Einzelaufträge an
  Datenmodell oder Rechten. Vorher `git fetch origin --prune` und offene PRs prüfen: nichts doppelt
  bauen. Vorschaubereiche: `docs/development/ARBEITSBEREICHE.md`.
- **Oberfläche nur nach `docs/design/DESIGN.md`;** ein Auftrag zu einem Bereich gleicht **alle**
  seine Seiten an.
- **Startinhalte** (Bibliotheken, Vorlagen, Textbausteine, Preisblatt-Entwürfe) gehören als
  Inhalt zum Lieferumfang, nicht als vorgebautes Datenmodell.
- **Referenzabgleich:** Nennt Jannes' Auftrag einen Bereich, gibt Praxissoftware Abläufe und
  Schrittzahlen vor, nie Texte, Bilder, Symbole (`docs/product/kernablaeufe.md`).
- **Subagenten** für Recherche, Review (`.claude/agents/`) und parallele Oberflächenarbeit in
  Worktrees; Migration und RLS seriell.
- **Doku je PR, nur vier Dinge:** PR-Beschreibung (Spec, Prüfungen, Checkliste, Bilder, Fragen),
  kurze Annahmen mit Anker, `fortschritt.json` (`pnpm fortschritt --schreiben`), STATUS in drei
  Zeilen. Befunde ohne Nummer nach `docs/development/BEFUNDE.md`, behobene löschen; Ideen
  außerhalb des Auftrags nach `docs/product/` (`/idee`), nicht in den Code.
- **Gemessen** werden die Software auf synthetischen Daten und Jannes' Zeit, nie Mitarbeitende,
  nie per Telemetrie (§20). Merge bleibt bei Jannes.
- **Bericht:** PR-Link, neue Annahmen je ein Satz, Fragen, Vorschlag für den nächsten Auftrag;
  lokale Schritte wie `git pull` nur als Fußnote.
