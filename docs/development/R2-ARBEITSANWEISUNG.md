# R2 Konsolidierung — Arbeitsanweisung für Knoten 3 und 4

Stand: 2026-09-14, nach „Freigabe" durch Jannes. Repository `janneswichelhaus/PraxisSoftware`,
Branch `claude/konsolidierung-r2` (lokal angelegt, = `origin/main` 7160fd5, PR #39 enthalten).
**Bis jetzt ist keine Datei im Repository geändert** (`git status` leer).

Quellen mit Details (gleicher Container): Linsen-Ergebnisse als JSON unter
`/tmp/claude-0/-home-user-PraxisSoftware/4ff7811a-3095-5948-9486-473fa8c99656/scratchpad/r2/L1a.json … L4b.json`
(L2b.json ist syntaktisch defekt; Inhalt steht in der Tabelle unten), Arbeitsnotizen `/tmp/r2-status.md`.
Jeder Befund dort trägt `beleg` (ausgeführte grep/git-Ausgabe) und `bleibt` (Zielzustand).

---

## 0. Auftrag und harte Regeln (aus dem Sessionprompt, unverändert gültig)

Ziel der Runde: Reduktion — weniger Dateien, weniger Zeilen, keine Dopplungen, keine Widersprüche.
Alles, was das Repository nicht messbar schlanker oder konsistenter macht, ist außerhalb des Auftrags.
Pfad D nach `docs/development/GRAPH-ENGINEERING-WORKFLOW.md`. Nie auf einen anderen Branch pushen.

- Kein Feature-Code, keine Migration, keine Policy, keine Abhängigkeit, kein neuer Anbieter. Code nur als
  Hygiene (toter Code, Duplikate, Kommentare, Tests, Skripte), durch bestehende Gates gedeckt.
- Kein Security-, RLS- oder Datenschutztest und kein CI-Gate wird abgeschwächt. Verschärfen ist erlaubt.
- Löschen vor Archivieren. Git-History ist das Archiv. Keine neuen Archiv-Abschnitte, keine
  „erledigt"-Listen, keine durchgestrichenen Zeilen.
- Keine echten Daten, keine Secrets, kein Deployment, keine Änderung an Repository-Einstellungen
  (Klickliste für Jannes).
- Jede gemeldete Prüfung ist tatsächlich gelaufen. Jede Annahme wird als `ANN-NNN` registriert und im
  Bericht genannt.
- Offene Punkte blockieren nicht (§15.1). Stopp nur bei der Hard-Stop-Liste.
- Rang bei Konflikten: `PROJECT_PRINCIPLES.md` > ADRs > Feature-Spec > `ASSUMPTIONS.md` >
  `PRODUCT_VISION.md` > `docs/product/`. `OPEN_DECISIONS.md`, `ROADMAP.md`, `docs/development/*` ohne Rang.
- Lesetechnik: `wc -l`, `grep -n`, Überschriften, gezielte Zeilenbereiche; keine Datei über 400 Zeilen
  am Stück. Arbeitsnotizen nach `/tmp/r2-status.md`, nicht ins Repo.
- Antwortformat, erste Zeile jeder Antwort:
  `[Knoten n — Name] gelesen: n | geändert: n | offen: n | nächster Schritt: …` — danach nur Inhalt.

### Knoten 3 — UMSETZUNG (freigegeben)

- Reihenfolge: Löschen → Zusammenlegen → Korrigieren → Code-Hygiene → Betriebsmodell →
  Prinzipien 0.10.1 → ADR-013 Fassung 3. Ein Commit je Befundgruppe, Befund-Kennungen (`R2-NNN`) in
  der Commit-Message, Trailer aus der jeweiligen Sitzung (System-Reminder: `Co-Authored-By` und
  `Claude-Session`). Keine Modellkennung in Commits, PR-Titel/-Body oder Code.
- Nach jeder Gruppe nur die eng betroffenen Checks. Am Ende in **einem** Aufruf:
  `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check`.
  `pnpm test:db` nur bei berührten Migrationen oder Policies (`pnpm db:start`,
  `export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres`, `pnpm test:db` in einem
  Aufruf) — nach Plan nicht nötig.
- Linkprüfung aller relativen Markdown-Verweise per Skript (Teil von `docs:check`); Ausgabe in den Bericht.
- `PROJECT_PRINCIPLES.md` als eigener Commit mit neuer Version (0.10.1) und Änderungsvermerk (§21).
  ADR-Änderungen nur als Fassung nach `docs/adr/README.md`.
- Push (`git push -u origin claude/konsolidierung-r2`, bei Netzfehlern 2/4/8/16 s Retry) und Pull Request
  gegen `main`. PR-Beschreibung: Baseline vs Ergebnis, Befund-Mapping, gelaufene Prüfungen, offene Punkte.
  Kein Auto-Merge, kein Merge durch die Session. Jannes merget selbst nach grüner CI.
  Melden: PR-Link, CI-Status, was Jannes nach dem Merge ausführt (`git pull origin main`; `pnpm install`
  nur bei geänderter `pnpm-lock.yaml`).

### Knoten 4 — BERICHT (≤ 40 Zeilen)

Baseline vs Ergebnis in einer Tabelle; Commits; gelaufene Prüfungen; neue `ANN-NNN`; was bewusst offen
bleibt; Vorschlag für die nächste Session (Default: ROL-EPIC-001, sofern nichts dagegen spricht).
Kandidaten für eine spätere Tooling-Session (K1-Prüfskript, Gate-Beschleunigung, Skill-Ergonomie) nur als
Stichwortliste. Dann Stopp.

**Zusätzliche Berichtspflichten (Jannes, bei Freigabe):**
- Fünf zufällig gewählte ANN als Vorher/Nachher-Gegenüberstellung (je 3 Zeilen).
- Testanzahl 1 462 vor und nach Gruppe 5 belegen (Vitest-Ausgabe).

---

## 1. Entscheidungen von Jannes (Knoten 1 + 2)

- Offene Punkte: (1) `docs/STATUS.md` und `pnpm docs:check` anlegen. (2) Branch
  `claude/konsolidierung-r2` ist richtig. (3) R2-007, R2-008, R2-011 wie empfohlen.
  R2-020: `fertig`, nicht `abgenommen` (kein Beleg heißt nicht abgenommen).
  R2-029: Hausregel ändern, überführte Einträge auf Kopf + Stand-Zeile.
- R2-001 bis R2-039 und alle Sammelposten: wie in Knoten 2 aufgelöst, mit zwei Korrekturen:
  - **R2-002:** In der Definition of Done „Auto-Merge erlaubt" streichen. Neuer Wortlaut:
    „Jannes mergt nach grüner CI." Auto-Merge ist auf diesem GitHub-Plan nicht verfügbar; **alle
    Stellen, die Auto-Merge nennen, entsprechend ändern.**
  - **R2-017:** Eine Modellliste. Standard für Folgesessions: Opus 5, Default-Effort;
    Migration/RLS/Policies: Opus 5 `xhigh`. Als `.claude/settings.json` projektweit festschreiben
    (Schlüssel gegen `code.claude.com/docs/en/model-config` geprüft: `model`, `effortLevel`,
    `modelSettings.<modell>.effort`; Rangfolge `/model` > CLI-Flag > `ANTHROPIC_MODEL` > settings.json).
- Sammelposten: alle umsetzen. **Abnahmeabschnitte abgenommener Loops bleiben unverändert und sind von
  Zeilen-Obergrenzen ausgenommen.**
- Zielgrößen (Pflicht):
  - `ASSUMPTIONS.md` ≤ 800 Zeilen: je ANN maximal Kopf, Aussage (1–3 Sätze), Code-Anker, Änderungspfad,
    Wiedervorlage (plus eine Zeile Begründung mit Quellen wegen §15.1 Punkt 3). Alles darüber hinaus in
    die Git-Historie.
  - `OPEN_DECISIONS.md` ≤ 400 Zeilen; Volltexte für externe Stellen (B1, B4, B5, B9, B10, B11, C6, E2)
    bleiben unverändert → **R2-F01 Option A: nach `docs/decisions/ANFRAGEN.md`**.
  - `CLAUDE.md` ≤ 150 Zeilen, nur Einstieg mit Verweisen.
  - `PROJECT_PRINCIPLES.md` in dieser Runde nur R2-007; Kürzung als Vorschlag für eine spätere Runde notieren.
- Fragen R2-F01 bis R2-F07: **alle Option A** (siehe Abschnitt 6).
- **Invarianten für Gruppe 2 (Register-Umbau):**
  - 53 ANN vor und nach dem Umbau; Kennung, Kategorie, Status, Datum, Anker und Wiedervorlage jedes
    Eintrags bleiben unverändert.
  - Begründung wird gekürzt, nicht umgedeutet: Quellen (§, ADR, Gesetz) bleiben genannt; ist eine
    Begründung nicht auf zwei Sätze zu bringen, bleiben drei stehen.
  - Vor dem Umbau eine Kopie der alten Datei außerhalb des Repos ablegen
    (`/tmp/ASSUMPTIONS.vorher.md`) und nach dem Umbau per Skript prüfen: gleiche 53 Kennungen, je
    Eintrag gleiche Kategorie, gleicher Status-Token, gleiches Datum, gleicher Anker-Pfad, gleiche
    Wiedervorlage.

---

## 2. Baseline (2026-09-14, 7160fd5) — Maßstab für den Bericht

| Maß | Wert |
| --- | --- |
| `*.md` unter `docs/` | 53 Dateien, 19 745 Zeilen |
| `*.md` im Root | 3 Dateien, 1 909 Zeilen (PRINCIPLES 1 550, CLAUDE 293, README 66) |
| alle getrackten `*.md` | 59 Dateien, 22 326 Zeilen |
| `ASSUMPTIONS.md` | 3 575 Zeilen, 53 `ANN-` (001–053), alle mit echtem Code-Anker |
| `OPEN_DECISIONS.md` | 1 415 Zeilen, 27 Punkte, Historie 174 Zeilen |
| Archive | `docs/decisions/archiv/OPEN_DECISIONS-erledigt.md` 285 Z., `docs/development/archiv/ROADMAP-AENDERUNGEN.md` 35 Z. |
| Remote-Branches / offene PRs | 4 (main + 3 alte) / 1 (#37) |
| Lint | 0 Fehler, 6 Warnungen, 48 s |
| Vitest unit | 92 Dateien, **1 462 Tests**, 87,7 s |
| CI | 5 Jobs (quality, database, security, e2e, e2e-supabase); alle 9 Pflichtprüfungen ADR-013 F2 vorhanden |

Messbefehle: `find docs -name '*.md' | wc -l`; `find docs -name '*.md' -print0 | xargs -0 cat | wc -l`;
`git ls-files '*.md' | xargs cat | wc -l`; `grep -cE '^### ANN-[0-9]{3}' docs/decisions/ASSUMPTIONS.md`;
`git branch -r`; `time pnpm lint`; `time pnpm test` (Zeile „Tests … passed").

---

## 3. Knoten-1-Tabelle (Befunde, nach Verifikation)

Verifikation: neun „hoch"-Befunde je durch einen zweiten Agenten geprüft — acht bestätigt und auf
mittel/niedrig herabgestuft, einer widerlegt (Auslöserliste; nur `sandbox/SKILL.md:24-25` weicht ab →
Sammelposten). Nach Verifikation kein Befund „hoch".

| Nr. | Schwere | Fundstelle | Zitat | Maßnahme |
| --- | --- | --- | --- | --- |
| R2-001 | mittel | `docs/development/DEVELOPMENT_WORKFLOW.md:3-6` ↔ `GRAPH-ENGINEERING-WORKFLOW.md:26-46,243` | „Warum wir so arbeiten. Die Regeln selbst stehen in `CLAUDE.md`" | zusammenlegen: nur Tabelle „Wer ändert welches Dokument" (179-189) nach GRAPH, Datei entfällt (−185 Z., −1 Datei; Verweise `CLAUDE.md:258`, `GRAPH:243`, `README.md:45`, `VER-EPIC-002.md:10,102`, `ROADMAP:851`) |
| R2-002 | mittel | `CLAUDE.md:292-293` ↔ `GRAPH:211-214` ↔ `DW:193-198` ↔ `ROADMAP.md:116-121,607-610,634-640` ↔ `feature-loop/SKILL.md:266-268` ↔ `docs/DEVELOPMENT.md:393-397` | „gemergt, sobald die CI grün ist (Auto-Merge erlaubt); die Abnahme folgt binnen sieben Tagen" | zusammenlegen: eine Ausformulierung (ROADMAP „Definition of Done"), sonst Verweis; **Wortlaut neu: „Jannes mergt nach grüner CI; steht ein Zweitreview (A5) aus, erst danach. Die Abnahme folgt binnen sieben Tagen."** |
| R2-003 | mittel | `ADR-013:82-86,104-112` ↔ `GRAPH:115-132` ↔ `SKILL:37-39,188-198` ↔ `ROADMAP.md:649-652,661-664` ↔ `DW:153-161` | „Zweitreview in frischem Kontext vor dem Merge — in derselben Session durch einen Review-Subagenten" | zusammenlegen: ADR-013 Punkt 9 bleibt; GRAPH/SKILL/ROADMAP je ein Satz mit Verweis (−30 Z.) |
| R2-004 | mittel | `CLAUDE.md:52-83` ↔ `PROJECT_PRINCIPLES.md:1033-1079` ↔ `DW:79-102` | „5. **Im Bericht nennen** — jede neue Annahme mit einem Satz" | korrigieren: CLAUDE.md ersetzt §15.1 Punkt 5 „Validieren lassen"; auf „Was bleibt ein Stopp" + Verweis kürzen (−47 Z.); der Absatz „Was bleibt ein Stopp" wird von `GRAPH:99`, `SKILL:216` namentlich referenziert — erhalten |
| R2-005 | mittel | `.claude/skills/sandbox/SKILL.md:11-13,20-35,57-80` ↔ `GRAPH:13-14,88-95,137-199` | „hier steht nur, wann welche greifen" | zusammenlegen: Pfad-S-Regeln nur im Skill; GRAPH „Pfad S" auf Knoten S1–S6, Lebensdauer, „nie darf"-Liste (−45 Z.); Selbstbeschreibung Skill:11-13 korrigieren |
| R2-006 | mittel | `GRAPH:75-100` ↔ `CLAUDE.md:206-215,240-245,290-292` ↔ `DW:8-17,45-63` ↔ `SKILL:9-12,31-37` ↔ `sandbox:21-30` ↔ `ROADMAP.md:110-114,627-631` | „überlebt kein Wert die Sitzung, ist er **Pfad S**" | zusammenlegen: K1-Definition nur in GRAPH, Loop-Zuschnitt nur im Feature-Loop-Skill; CLAUDE.md sagt „Abschlussbericht" zweimal (−24 Z.) |
| R2-007 | mittel | `PROJECT_PRINCIPLES.md:1242-1260,1263-1285` ↔ `CLAUDE.md:8-29` ↔ `docs/adr/README.md:80-115` ↔ `README.md:11-17` | „\| ADR-013 \| CI/CD und Release-Governance \| §11, §12 \|" | korrigieren (Korrekturversion **0.10.1**, kein 0.11): §21 trägt die sechsstufige Rangfolge (heute nur in ranglosem CLAUDE.md); Fassungs-/Statusvermerke nur in `adr/README` (ADR-013 F2 fehlt in §21) |
| R2-008 | mittel | `CLAUDE.md:131-142,146-166,289` ↔ `docs/DEVELOPMENT.md:23-29,35-47,170-171,189-206,335-338` ↔ `README.md:58-64` ↔ `.claude/hooks/session-start.sh:5-8,37-38` ↔ `abnahme/README.md:19-21` ↔ Skills | „pnpm test:db # Migrationen + RLS gegen echtes PostgreSQL" | zusammenlegen: Befehle in CLAUDE.md nur als Liste; db:start/Shim/Windows nur DEVELOPMENT.md; Cloud-Hinweis nur CLAUDE.md, vier andere Stellen ein Halbsatz; pnpm install/Playwright-Variable: „setzt der SessionStart-Hook"; `pnpm dlx supabase@2.116.0` in `CLAUDE.md:289`, `DEVELOPMENT.md:170-171` |
| R2-009 | mittel | `docs/decisions/archiv/OPEN_DECISIONS-erledigt.md` (285 Z.), `docs/development/archiv/ROADMAP-AENDERUNGEN.md` (35 Z.); Verweise `OPEN_DECISIONS.md:64,145,146,158,168,170,171,475,764,769,931,983,988,993,1409`, `ROADMAP.md:859` | „Die Volltexte erledigter Punkte stehen in `archiv/OPEN_DECISIONS-erledigt.md`" | löschen: beide Dateien; Verweise → „Volltext: Git-Historie bis 7160fd5" (−320 Z., −2 Dateien) |
| R2-010 | mittel | `OPEN_DECISIONS.md:1242-1415` (Historie), `:9-43` (Stand-Prosa) ↔ `ASSUMPTIONS.md:5-29` (Änderungsjournal) | „Ältere Fassungen dieses Journals stehen in der Git-Historie." | löschen: je ein Einzeiler `git log -- <Datei>`; Kopfverweise `OD:12-13,41-43,59-60` nachziehen (−230 Z.) |
| R2-011 | mittel | `ASSUMPTIONS.md:152-211` (Übersichtstabelle) | „Die Übersicht war seit ANN-045 nicht nachgezogen; die Zeilen sind aus ihren Einträgen nachgetragen." | löschen; Prüfpaket-Filter als `grep`-Einzeiler im Kopf (−57 Z.) |
| R2-012 | mittel | `ASSUMPTIONS.md:470-558` (ANN-006 verworfen), `:2253-2317` (ANN-036 überführt) ↔ Regel `:50-51,70-72` | „Der Eintrag bleibt mit Verankerung und Änderungspfad stehen." | korrigieren: Kopf + Anker + Verweis (ADR-004 F2 / ADR-018 F3); Regel „nie gelöscht" → „Kopf bleibt, Volltext in Git" (−135 Z.) |
| R2-013 | mittel | `OPEN_DECISIONS.md:1097-1160` (E14), `1162-1195` (E15), `1197-1207,516-523` (E-20/21), `851-890` (B15-Nachtrag) ↔ Regel `:62-65` | „hier bleibt je Punkt ein Zweizeiler mit Überschrift und Verweis" | löschen: E14, E-20/21, B15-Nachtrag auf Zweizeiler; E15 Zweizeiler mit Verweis ADR-004 F2 + ROL-EPIC-001; B15-Nachtrag → ANN-041 (−150 Z.) |
| R2-014 | mittel | `ROADMAP.md:726-759` („Antworten E-15 bis E-19") | „Eingearbeitet an den betreffenden Stellen." | löschen nach Zeilenprüfung (E-15: Z. 96/155/206/449, E-16: 359, E-17: 436, E-18: 417, E-19: 441); Verweise `ROADMAP:7-9`, `OPEN_DECISIONS:41-43` (−33 Z.) |
| R2-015 | mittel | `OPEN_DECISIONS.md:45-125` ↔ `ASSUMPTIONS.md:42-60,74-82,100-104` ↔ `PROJECT_PRINCIPLES.md:1033-1075` ↔ `CLAUDE.md:30-40` | „Eine Annahme DARF NICHT einer MUSS- oder DARF-NICHT-Anforderung … widersprechen" | korrigieren: OD auf Statusdefinition „vorläufig entschieden" (5 Z.) + Verweis; ASSUMPTIONS-Kopf auf Lebenszyklus, Aufbau, Kennung im Code, Prüfpaket (−65 Z.) |
| R2-016 | mittel (verifiziert) | `ROADMAP.md:368-372,376` ↔ `ADR-019:324-326`, `ROADMAP.md:212-217,587`, `OPEN_DECISIONS.md:177` | „Ihre Einordnung in den Rückwärtsplan legt Jannes mit E-21 fest; Vorschlag:" | korrigieren: Satz ab Ende Z. 368 („Ihre") bis Z. 372 durch Verweissatz auf den Rückwärtsplan ersetzen (MAP-002 Nov 2026, MAP-003 Dez 2026, MAP-004/005 Jan 2027, MAP-006 Apr 2027; E-21 erledigt 2026-09-13); „; E-21" aus Z. 376 |
| R2-017 | mittel | `ROADMAP.md:683-686` ↔ `ADR-013:103-106`; `ROADMAP.md:131-143` ↔ `:681-693`; `GRAPH:141`, `sandbox/SKILL.md:35` | „\| Migration, RLS-Policy, RPC, Berechtigungen \| Opus 5 \| `xhigh` \|" | **eine Modellliste = `.claude/settings.json`** (`"model": "opus"`, kein `effortLevel`); xhigh-Regel in `SESSION-START.md`; Modelltabelle und Modellspalte der Sessions-Tabelle entfallen; Zweitreview-Pflicht (Nr. 8) in der Sessions-Tabelle korrekt genannt |
| R2-018 | mittel | `ROADMAP.md:701-703` ↔ `:714-718`; `OPTIMIERUNG.md:413-414`; `DW:182-184` | „und diese Datei lesen. Sonst nichts." | korrigieren: Schritt 1 nennt STATUS.md, ROADMAP, ARBEITSBEREICHE §2, git log; OPTIMIERUNG:413 nachziehen |
| R2-019 | mittel (verifiziert) | `ROADMAP.md:720-722` ↔ `docs/DEVELOPMENT.md:217-223` ↔ Routine `trig_01N5FanspQGxJP9S9rnZiZHj` (Prompt Stand 2026-09-07, sechs eigene Schritte, ohne Sandbox-Schritt, liest nur ROADMAP + git log) | „ihr Prompt wurde am 2026-09-06 auf dieses Format umgestellt (E-10)" | korrigieren + Klickliste: DEVELOPMENT.md „Prompt Stand vor 5.2, fünf Schritte; Schritt 6 zieht Jannes nach"; Roadmap-Zeile „Jannes: Routine-Prompt nachziehen"; neuen Prompt-Text in DEVELOPMENT.md liefern |
| R2-020 | mittel (verifiziert) | `docs/development/fortschritt.json:30-35` ↔ `ROADMAP.md:807-809,64-66` | „"status": "abgenommen"" (Fundament) | korrigieren: `fundament` → `fertig` (Gesamt 31,5 → 31,2 %; Block A 59,6 → 58,5) |
| R2-021 | niedrig (verifiziert) | `ROADMAP.md:340,65,210` ↔ Fortschrittstabelle `807-843` ↔ `abnahme/etappe-g:204` | „\| ~~FIX-EPIC-001~~ \| Zugang und Sitzung halten, was sie versprechen \|" | Roadmap-Zeile nach Z. 834 (nach UX-012, vor FIX-EPIC-003): „FIX-EPIC-001 (FIX-001, FIX-003 bis FIX-006) Zugang und Sitzung halten, was sie versprechen \| fertig \| 2026-09-12 \| `1064421` (Squash-Merge PR #32) — Befund-Loop, nicht aus der Roadmap (R6); Abnahme braucht Docker \| (leer)"; **kein FIX-002 existiert**; JSON ist modellkonform (kein Posten) |
| R2-022 | mittel (verifiziert) | `OPEN_DECISIONS.md:134,135,160,165` ↔ `ROADMAP.md:505-514` | „B2 … Roadmap G12 / B1 … Roadmap G13, Feb 2027 / E5 … Roadmap G8" | korrigieren: 134 → G15, 135 → G14, 160 → G14 (DSFA-Paket enthält die Nachweistabelle), 165 → G6; Z. 492 optional „G14, BETRIEB-001 (G16)"; Z. 152 unverändert |
| R2-023 | mittel (verifiziert) | `docs/DEVELOPMENT.md:339-342` ↔ `tests/e2e/authenticated/` (18 Specs, 128 Tests) | „Belegt sind die Kernflüsse von PAT-002 und PAT-003 samt Persistenz über einen Neuladevorgang" | korrigieren: Einschränkung 2 auf einen Satz („18 Spezifikationen hinter der Anmeldung im Projekt `authenticated`/Job `e2e-supabase`; Breite bei `test:db`") |
| R2-024 | mittel | `docs/DEVELOPMENT.md:262-286` ↔ `ADR-007:58-65`, `ROADMAP.md:240,517`, `OD:89-94`; `:289-293` ↔ `ADR-010:96-100`; `:312-316` ↔ `:380-383`; `:363-383` | „Hier steht nur, was davon den Entwicklungsstand dieses Repositories betrifft" | löschen/zusammenlegen: Go-live-Liste, Audit-Lesepfad und Einschränkungen 8/9/11 → je ein Verweissatz (−45 Z.) |
| R2-025 | mittel | `ROADMAP.md:796-797` ↔ `:762-764`, `fortschritt.json:17-20` | „**Gebaut ist nicht fertig.** Ein Loop ohne Abnahme zählt `0,85`" | korrigieren: „Fertig ist nicht abgenommen. Ein fertiger Loop zählt 0,85" |
| R2-026 | mittel | `docs/abnahme/etappe-0:23,102,128,166,252`; `etappe-1:50,97,133,157,188,222,313,362,389,907,1382,1453`; `etappe-g:37,53,77,103,109,271,392,423,432,443,467,493` ↔ `src/app/navigation.tsx:167,177,180,262` | „Praxis → Sicherheit → **Aufbewahrung und Löschung**" | korrigieren: „Organisatorisches → Mitarbeitende/Sicherheit/Aufbewahrung" (seit PR #30, 622f41a) |
| R2-027 | mittel | `ROADMAP.md:546,561,562,565,566,588-592` ↔ `OPEN_DECISIONS.md:126-180` | „Offene Punkte aus `docs/decisions/OPEN_DECISIONS.md` mit Fälligkeit." | löschen: Zeilen E8, D, E10, E14 und „Erledigt"-Liste (−10 Z.) |
| R2-028 | mittel | `MAP-LOOPS.md:13-34,215-218,252-256` ↔ `ADR-019:120-126,216-228,309-310`; `ROADMAP.md:483`, `ARBEITSBEREICHE.md:206` ↔ `MAP-LOOPS.md:229`; `providerpruefung-kartendienst.md:99-110,121-124` ↔ `ADR-019:249-270` | „Die Vorschau `/touren` ersetzt MAP-006 schon im April 2027" | löschen/korrigieren: Vorbemerkung und Fassung-1-Korrekturen → Verweis auf ADR-019 (−43 Z.); Richtung „MAP-006 ersetzt `/touren`"; `MAP-LOOPS.md:3` Stand-Datum |
| R2-029 | mittel | `docs/product/IDEENSPEICHER.md:78,156-161,167,205-213` ↔ 15 überführte Einträge (`ideen/10-praxisverwaltung.md:49-105` PRX-002, `672-717` PRX-029, `720-756` PRX-030, `782-820` PRX-032, `07-ki-assistenz.md:152-203` KI-007, PRX-001/004/006/007/011/014/020/028/038/040) | „stehen jetzt auf `überführt` und verweisen nur noch" | löschen: Hausregel `:78` → „Überführte Einträge behalten Kopf und Stand-Zeile; die Begründung liegt im Ziel und in Git"; 15 Einträge kürzen; E-16-Absätze (`10-praxisverwaltung:705-717`, `IDEENSPEICHER:156-161`) und ADR-Protokoll im Journal (`:205-213`) raus; falsche Angabe „PRX-029/032 gebaut" korrigieren (−220 Z.); PRX-042, LZK-006 unverändert |
| R2-030 | mittel | `docs/product/ideen/referenz-wettbewerb.md:9-11,45-63,258-271,273-300` | „Nutzerkritik, die wiederkehrt: schwer erreichbarer Support (THEORG, NOVENTI/ azh)" | löschen: Preise/Kritik, Portalkriterien, „ohne Entsprechung"-Liste, Spalte „Bei uns" (−60 Z.); Funktionstabellen 1–13 bleiben; `referenz-navigation.md` bleibt |
| R2-031 | mittel | `origin/claude/focused-hopper-mwkc5d` (= Squash 1064421, PR #32), `origin/claude/praxissoftware-arch-graph-gc1a3u` (= 7160fd5, PR #39), `origin/codex/plan-verordnung-office-20260913` (PR #37, Inhalt in `VER-EPIC-002.md`); `ROADMAP.md:815,816,819,821,843` | „Branch `claude/praxissoftware-arch-graph-gc1a3u` — Prinzipien 0.10, ADR-004/010/018/019" | Klickliste (Branches löschen, PR #37 schließen, nicht mergen); korrigieren: 843 → „`7160fd5`, Merge PR #39"; 821 → „`255ecdd`, `37e8b64`, Merge PR #17 (`452f2ea`)"; 815/816 → „Merge PR #14 `8e72fc8`"; 819 → „Merge PR #16 `8374eef`" |
| R2-032 | mittel (verifiziert) | `src/features/preview/trennung.test.ts:101,124-130` | „const API_IMPORT = /\{([^}]*)\}\s*from\s*'@\/features\/([^'/]+)\/api'/g;" | korrigieren (Gate verschärfen): alle Importformen (named, `import * as`, default, Seiteneffekt, `import(`, relative Pfade) erfassen; Importziele außerhalb der Vorschaubereiche gegen Positivliste (`react`, `react-router-dom`, `@/components/ui/*`, `@/features/session/types`, `@/features/preview/*`) und für `@/features/<x>/api` nur ERLAUBTE_API_IMPORTE; Gegenprobe-Tests; Kommentar Z. 89-95 präzisieren; VERBOTEN/ERLAUBTE_API_IMPORTE unverändert. Heute kein Verstoß (nur `session/types` 10× und `tours/ToursPage.tsx:7 todayInTimeZone`) |
| R2-033 | niedrig | `src/features/prescriptions/api.ts:331,336,570`; `preview/vorschauContext.ts:121`; `appointments/api.ts:156`; `documentation/api.ts:414` | „export function restkontingent(prescription: Prescription): number {" | löschen: `restkontingent`, `gesamtkontingent`, `ersatzraeder`, `AppointmentKind`, `DocumentationStatus`; Re-Export `neueVorgangskennung, vorgangAusPfad` — `PrescriberFormPage.tsx:19`, `PrescriptionFormPage.tsx:26` importieren direkt aus `@/lib/abstecher` (−17 Z.) |
| R2-034 | mittel | `patients/api.ts:147` ↔ `prescriptions/api.ts:299` ↔ `staff/api.ts:71` ↔ `preview/format.ts:13` (`today/MyDayPage.tsx:31` importiert aus preview); `PatientMasterDataPage.tsx:96` ↔ `appointments/api.ts:307` | „export function formatDate(value: string \| null): string {" | zusammenlegen: neu `src/lib/datum.ts` mit `formatDate` (Semantik: '—' bei leer/ungültig, `dateStyle: 'medium'`, Kalendertag ohne Zeitzone); die drei api.ts re-exportieren nicht, Aufrufer importieren aus `@/lib/datum` (`PatientAppointmentsPage.tsx:14` `formatIsoDate` mit); `preview/format.ts` `formatDatum` → Verweis auf `@/lib/datum` (Sandbox-Gate lässt `src/lib` zu); `heute()` in `PatientMasterDataPage.tsx:96` → `todayInTimeZone(user.organizationTimeZone)` (Z. 160, 171; `user` in Z. 185 vorhanden); Tests `patients/api.test.ts:25-31`, `staff/api.test.ts:113-114` anpassen |
| R2-035 | mittel | 10 Testdateien (30-Z.-Appointment-Literal: `documentation/TreatmentNotePage.test.tsx:12`, `TreatmentNoteHistoryPage:17`, `CompleteTreatmentPage:13`, `TreatmentNoteRevisionPage:20`, `TreatmentNoteSection:13`, `TreatmentNoteAddendumPage:19`, `appointments/api.test.ts:15`, `EditEventPage:22`, `AppointmentDetailPage:13`, `EditAppointmentPage:17`); 14 DB-Tests `tagInTagen` (abweichend `supabase/tests/staff-management.test.ts:171`); E2E-Specs `zeit` (10), `laufTag` (12), `terminAnlegen` (10) | „function tagInTagen(tage: number): string {" | zusammenlegen: `testAppointment(overrides)` in `src/test-utils.tsx` (Muster `testPatient` Z. 77); `tagInTagen` als Export in `supabase/tests/helpers/db.ts` (setUTCDate-Fassung); `zeitImLauf(lauf, minutenAbAcht)` und `terminUeberOberflaeche(page, {...})` in `tests/e2e/authenticated/helpers.ts` (dort schon `tagImFenster:103`, `terminUeberApi:372`); **Testanzahl bleibt 1 462**; E2E-Specs nur syntaktisch/typecheck geprüft (kein Stack in der Cloud) |
| R2-036 | mittel | `docs/DEVELOPMENT.md:389-390` ↔ `.github/workflows/ci.yml:28,59,94,118,154` | „erforderliche Checks `quality`, `database`, `security`, `e2e`, `e2e-supabase`" | korrigieren: Anzeigenamen „Lint, Typecheck, Tests, Build", „Migrationen und RLS-Policies", „Secret Scanning und Dependency Audit", „End-to-End", „End-to-End hinter der Anmeldung" (Kennung in Klammern) |
| R2-037 | mittel | `.github/workflows/ci.yml:115` ↔ `ADR-013:186-187` ↔ `OPEN_DECISIONS.md:1221`; `package.json:27` | „Welche Schweregrade eines Dependency-Scans blockieren einen Merge, und welche werden nur berichtet?" | korrigieren: neue **ANN-054** „Dependency-Audit blockiert ab Schwere `high`" (Kategorie Technik, Herkunft ADR-013 Folgefrage/OPS-002, Anker: Kommentar `# ANN-054` an `ci.yml:115`, Änderungspfad klein, Wiedervorlage OPS-002); Skript `audit` in package.json löschen; Verweis in OD:1221 |
| R2-038 | mittel | `src/marke.test.ts:28-31,51,52`; `src/designsystem.test.ts:22-25`; `src/features/retention/klassen.ts:111`; `scripts/fortschritt.mjs:49` | „ist kein Pfad-Sink fuer eslint-plugin-security" | korrigieren: `eslint.config.js` Testblock (Z. 68-75, `src/**/*.test.{ts,tsx}` …) + `'security/detect-non-literal-fs-filename': 'off'` mit Begründung (Tests lesen nur den versionierten Baum); Kommentar `marke.test.ts:28-30` und halber Disable `designsystem.test.ts:24-25` raus; `klassen.ts:111` `// eslint-disable-next-line security/detect-unsafe-regex -- verankert, optionale Gruppen mit eigenem Endzeichen (linear); Wert aus der Datenbank`; `fortschritt.mjs:49` `// eslint-disable-next-line security/detect-object-injection -- status aus versionierter fortschritt.json, Fehlwert wirft` → 0 Warnungen; `src/` außerhalb Tests unverändert |
| R2-039 | mittel | `scripts/screenshots.mjs:22,64,111` | „Supabase-Stack (`pnpm db:start`, siehe docs/DEVELOPMENT.md) UND das Konto" | korrigieren: `db:start` startet nur PostgreSQL ohne GoTrue; Verweis auf `DEVELOPMENT.md` Abschnitt Stack-Start (`pnpm dlx supabase@2.116.0 start`) |

### Sammelposten (alle umsetzen)

- **Steuerungsdokumente:** 6 Kurzregeln 4–6× wörtlich („test:db läuft in der Cloud" `CLAUDE.md:157-161`/`SKILL:161-163`/`ROADMAP:659-660`; „Gate nie abschwächen" `CLAUDE.md:178-181`/`SKILL:230-231`; „keine Prüfung als gelaufen melden" `CLAUDE.md:198-199`/`GRAPH:219-220`/`SKILL:174-175`/`sandbox:156`; „Ablaufrunden eingefroren" 6×; „Prototyp zwei Loops" 4×; Subagent-Regel 3×) → je die Stelle mit Zweck bleibt, Rest verweist; **Gate-Texte in CLAUDE.md:178-181 und sandbox:110-112 bleiben ungekürzt**; Kennungserklärung `CLAUDE.md:38-39` ↔ `ROADMAP:28-31`; „Fehlt eine Voraussetzung aus Spur B" `ROADMAP:17-21` ↔ `SKILL:18-23`; Wochenupdate-Schritt 6 in `DEVELOPMENT.md:216-220`; Repo-Struktur 3× (`CLAUDE.md:111-119`, `README:31-48`, ADR-015); Ideenspeicher-Regeln 3–4× (`CLAUDE.md:45-50,248-250`, `SKILL:81-96`, `ROADMAP:22-25,647-648`); Rangtabelle 3× (`PRODUCT_VISION:14-39`, `IDEENSPEICHER:11-26` → je ein Satz „Rang 5/6 nach §21"); `sandbox/SKILL.md:24-25` Zusatz „außerhalb src/features/preview" streichen (ADR-013-Wortlaut; GRAPH K1:85-86 deckt synthetische Daten).
- **Register:** 10 Status-Historie-Nachträge (`ASSUMPTIONS:479,1139,1257,2173,2262,2475,2575,333,414,632`); 3 Ablösungs-Nachträge (`:313-322`, `:1077-1084`, `:3333-3340`); 3 Durchstreichungen (`:2486-2490`, `:2581-2584`, `:3329-3330`); 5 „Wie empfohlen bestätigt"-Nachträge (`:2116,2328,2402` u. a.); 10 „Annahmen:"-Rückverweise in OD (Kurzparaphrasen); B7 Gate-Liste `OD:503-510` → Verweis `providerpruefung` Teil 5, doppelter Absatz `OD:477-489`; F-Tabelle `OD:1209-1240` erledigte Zeilen (5) raus; erledigte Wiedervorlagen: ANN-012 Überschrift/`:874,165` „bis CAL-007" → „bis ABR-002", Nachtrag `:913-919` raus; ANN-020 `:1343` → „Datenschutzprüfung"; „hat keinen Rang" 5× (bleibt in §21 und CLAUDE.md). (Durch die Einheitsstruktur in Gruppe 2 ohnehin erfasst.)
- **Roadmap/Vision/Ideen:** `VER-EPIC-002.md:92-110` Prozessabsatz → Verweis; `ROADMAP:335` um ANN-014 ergänzen; `OPTIMIERUNG.md:293,430` TOUR-EPIC-001a → MAP-006; Durchstreichung `ROADMAP:459` (`~~Ampel (IDEA-TRN-003)~~` → raus, Status im Ideenspeicher); Abnahme-Nummerierung `etappe-1:1788/1794` (7→9) und `2020/2029` (8/8); 4 Herkunftsnotizen (`abnahme/README:6-11`, `etappe-0:10`, `DEVELOPMENT.md:160-161`, `OPTIMIERUNG:389-390`); Abnahme-Durchstreichungen `etappe-1:1490-1497` (Schritt entfällt, neu nummerieren), `etappe-g:167-180` (Schritt 9 → ein Satz: „Der zweite Faktor wird beim Anmelden noch nicht abgefragt (ANN-028, FIX-EPIC-002); geprüft wird nur die Einrichtung (Schritte 7 und 8)"); ADR-007 Folgefrage `:140-141` bleibt (Fassung erst, wenn ADR-007 ohnehin fällig — im Bericht nennen); Personal-Training-Plattform: `PRODUCT_VISION:187-204` auf drei Zeilen Zielbild + Verweis Roadmap Stufe 3, `:132-138` eine Zeile; `PRODUCT_VISION:49` Halbsatz „die Anwendung selbst ist noch nicht umgebrandet" → „die Anwendung trägt sie seit MARKE-001 (2026-09-11)"; `PRODUCT_VISION:94-105` Kartendienst-Kontext kürzen; Vermerk 5.3 nennt den Skriptwert (31,2 %); Wochenroutine nur in DEVELOPMENT.md erzählt, `ROADMAP:720-722` verweist.
- **Code:** 5 kleine Dopplungen: `staffFullName` (`staff/api.ts:67`) → `fullName` aus `patients/api.ts:143` (Signatur `{ given_name; family_name }`; Aufrufer `StaffListPage.tsx:10`); `hhmm` (`CalendarGrid.tsx:103`) und Inline in `appointments/api.ts:445-446` → `minuteZuZeit` (`calendar.ts:422`); `MyDayPage.tsx:54 fruehesteZuerst` → `nachUhrzeit` (`today/api.ts:170`, Typ auf `{ starts_at; id }` verallgemeinern), `MyDayPage.tsx:83 standVon` → `formatLocalTime` (`appointments/api.ts:289`); StaffMember-Fixture 5× → `testStaffMember()` in `src/test-utils.tsx`; tel-Bereinigung `PatientMasterDataPage.tsx:44`, `StaffMemberDetailPage.tsx:51` → `telHref` (`today/api.ts:148`, nach `src/lib` verschieben); 21 überflüssige `export` (nur dateiintern genutzt; Liste per Scan: `calendar.ts:14 KALENDER_ANSICHTEN`, `:29 STATUS_FILTER`, `dokumentarten.ts:80 ERLAUBTE_MIME_TYPEN`, `documentation/api.ts:28 treatmentNoteSchema`, `env.ts AppEnv/EnvSource`, `Statusmeldung.tsx Meldungston`, `Wortmarke.tsx Markenfassung` …) — `export` entfernen, sofern kein Test importiert; 24 Router-Mock-Fabriken → `mockRouter({ navigate, params })` in `src/test-utils.tsx` (Typalias `RouterModule` vs `RouterModul` vereinheitlichen); Kommentar `appointments/api.ts:56` korrigieren (Tagesliste nutzt `dayPlanStatusTon`); `dayKey` statt Inline in `appointments/api.ts:1049`, `PatientAppointmentsPage.tsx:207`; PLZ `50667` in 8 Testfixtures → `72070 Tuebingen` wie Seed (Assertions auf formatierte Anschrift mitziehen, z. B. `EditAppointmentPage.test.tsx:196`); `console.error` 3× bleibt (kein Verstoß). Nicht anfassen: `src/lib/location/contract.ts` (ADR-019-Vertrag, Anker ANN-016–018); 4 Zeitstempel-Formatierer (nicht identisch); `quelldateien()` in zwei Gate-Tests.
- **Gates/Skripte:** `package.json`: `test:all` und `audit` löschen; `format`, `db:reset`, `test:watch`, `preview` je eine Zeile in `DEVELOPMENT.md` „Befehle"; `.github/workflows/ci.yml`: `e2e-supabase` Schritt „End-to-End-Tests mit echter Anmeldung" → `pnpm test:e2e --project authenticated` (jeder Test läuft einmal, Job `e2e` bleibt der dockerfreie Rückfall), `fetch-depth: 0` (Z. 98-99, Job security) raus; `eslint.config.js:72` `no-non-null-assertion: off` raus; `.gitignore`: Boilerplate raus (`dist-ssr/`, `build/`, `blob-report/`, `.vitest/`, `secrets/`, `.secrets`, `supabase/.branches/`, `logs/`, `.vscode/*` + `!.vscode/extensions.json`), `.claude/settings.local.json` rein; Supabase-CLI-Version in `DEVELOPMENT.md` nur an einer Stelle (`:68-70`), `:77,108-110` verweisen; `CLAUDE.md:158-160` Zahlen („495 Tests, 45 s") raus; Dependabot: DEVELOPMENT.md nennt nur Alerts (Klick), Versions-Updates = Roadmap-Zeile bei OPS-002/G5; `MAP-LOOPS.md:32` `pnpm audit` ohne Level → Verweis ci.yml; ci.yml-Kosmetik (concurrency, timeout, Major-Tags, tsc 2×) **nicht** anfassen (kein Reduktionsgewinn, Gate-Nähe).

### Bewusst nicht angefasst (im Bericht wiederholen)

Gate-Wortlaute (`CLAUDE.md:178-181`, `sandbox/SKILL.md:110-112`, ADR-013 Punkt 9, §15.1, VERBOTEN/ERLAUBTE_API_IMPORTE); OD-Volltexte B1/B4/B5/B9/B10/B11/C6/E2 (→ ANFRAGEN.md unverändert); `providerpruefung` Teil 1–4; `contract.ts`; Abnahmeabschnitte abgenommener Loops (~1 300 Z., von Obergrenzen ausgenommen); IDEA-PRX-042, IDEA-LZK-006; Ideen-Dateien 01–06/08/09 inhaltlich; ADR-013 Punkte 6/7; GitHub-Einstellungen (Klickliste); pnpm-audit-Semantik; alle 53 ANN-Anker (geprüft, echt); E-1…E-21 (alle beantwortet).

---

## 4. Knoten-2-Text: Auflösungen, Zielstruktur, Betriebsmodell

### 4.1 Auflösungen je Befund (eine Quelle bleibt, Rest verweist oder entfällt)

| Nr. | Bleibt (nach Rang / Zweck) | Aktion |
| --- | --- | --- |
| R2-001 | `GRAPH-ENGINEERING-WORKFLOW.md` | `DEVELOPMENT_WORKFLOW.md` entfällt; Tabelle „Wer ändert welches Steuerungsdokument" (Z. 179-189) wird Teil von GRAPH „Verankerung"; 5 Verweise nachziehen |
| R2-002 | `ROADMAP.md` „Definition of Done" | Wortlaut: „Jannes mergt nach grüner CI; steht ein Zweitreview (A5) aus, erst danach. Die Abnahme folgt binnen sieben Tagen." Auto-Merge entfällt an allen 12 Live-Stellen (`CLAUDE.md:293`, `ROADMAP:76,117,139,210,608,635`, `GRAPH:130,211`, `DEVELOPMENT.md:392`, `ADR-013:111` → Fassung 3, `SKILL:197,268`); Vermerk 5.1 (`ROADMAP:852`) bleibt Chronik, Vermerk 5.3 hält die Rücknahme fest |
| R2-003 | ADR-013 Punkt 9 | GRAPH A4/A5, Skill K1/F, Roadmap-Regeln 8+12 je ein Satz + Verweis |
| R2-004 | `PROJECT_PRINCIPLES.md` §15.1 | CLAUDE.md behält nur „Was bleibt ein Stopp" (5 Zeilen) + Verweis; DW-Fassung entfällt |
| R2-005 | `sandbox/SKILL.md` | GRAPH „Pfad S" schrumpft auf Knoten S1–S6, Lebensdauer, „nie darf"-Liste; Selbstbeschreibung im Skill korrigiert |
| R2-006 | GRAPH (K1), `feature-loop/SKILL.md` (Zuschnitt) | CLAUDE.md, Sandbox-Skill, Roadmap je ein Satz; Dopplung `CLAUDE.md:290-292` entfällt |
| R2-007 | `PROJECT_PRINCIPLES.md` §21 (**0.10.1**, eigener Commit) | §21 trägt die sechsstufige Rangfolge (1 Prinzipien, 2 ADRs, 3 Feature-Spec, 4 ASSUMPTIONS, 5 PRODUCT_VISION, 6 docs/product); ADR-Tabelle nur ADR → Paragraph, Fassungs-/Statusvermerke allein in `docs/adr/README.md`; Änderungsvermerk 0.10.1 (Präzedenz 0.2.1, Z. 1535); CLAUDE.md/README verweisen |
| R2-008 | `CLAUDE.md` (Befehlsnamen, Cloud-Spezifika), `DEVELOPMENT.md` (Erklärungen) | Befehle in CLAUDE.md nur als Liste ohne Kommentare; db:start/Shim/Windows nur DEVELOPMENT.md; Cloud-Hinweis nur CLAUDE.md, vier andere Stellen ein Halbsatz; pnpm install/Playwright-Variable: „setzt der SessionStart-Hook"; `pnpm dlx supabase@2.116.0` überall |
| R2-009 | Git-Historie | beide Archivdateien löschen, 16 Verweise → „Volltext: Git-Historie bis 7160fd5" |
| R2-010 | Git-Historie | OD-Historie, OD-Stand-Prosa, ASSUMPTIONS-Journal löschen; je ein Einzeiler `git log -- <Datei>` |
| R2-011 | Felder im Eintrag | Übersichtstabelle löschen; Prüfpaket-Filter als `grep`-Einzeiler im Kopf |
| R2-012 | ADR-004 F2 / ADR-018 F3 | ANN-006, ANN-036 auf Kopf + Anker + Verweis; Registerregel „nie gelöscht" → „Kopf bleibt, Volltext in Git" |
| R2-013 | ADRs / Prinzipien 0.10 | E14, E-20/21, B15-Nachtrag auf Zweizeiler; E15 Zweizeiler mit Verweis ADR-004 F2 + ROL-EPIC-001 |
| R2-014 | die Zeilen, an denen E-15…E-19 eingearbeitet sind | Abschnitt löschen (Prüfung je Zeile, Ergebnis im Bericht) |
| R2-015 | §15.1, CLAUDE.md (Rang/Kennungen) | OD „Wie benutzt" auf Statusdefinition „vorläufig entschieden" (5 Z.) + Verweis; ASSUMPTIONS-Kopfregeln auf Lebenszyklus, Aufbau, Kennung im Code, Prüfpaket |
| R2-016 | Rückwärtsplan | `ROADMAP:368-372` → Verweissatz; „E-21" aus Z. 376 |
| R2-017 | `.claude/settings.json` | `"model": "opus"`, kein `effortLevel`; xhigh-Regel in `SESSION-START.md`; Modelltabelle (`ROADMAP:677-696`) und Modellspalte der Sessions-Tabelle entfallen; `sandbox/SKILL.md:35`, `GRAPH:141`, `ADR-013:110` verweisen; Zweitreview-Pflicht (Nr. 8) in der Sessions-Tabelle korrekt |
| R2-018 | Roadmap „Wochenupdate" | Schritt 1 nennt STATUS.md, ROADMAP, ARBEITSBEREICHE §2, git log; OPTIMIERUNG:413 nachziehen |
| R2-019 | Ist-Stand ehrlich | DEVELOPMENT.md: „Prompt Stand vor 5.2, fünf Schritte; Schritt 6 zieht Jannes nach" + Klickliste mit neuem Prompt-Text |
| R2-020 | Fortschrittstabelle | `fortschritt.json` `fundament` → `fertig` |
| R2-021 | Fortschrittstabelle | Zeile nach `ROADMAP:834` (Text in Tabelle oben) |
| R2-022 | Roadmap G1–G18 | OD 134 → G15, 135 → G14, 160 → G14, 165 → G6 |
| R2-023 | Bestand `tests/e2e/authenticated/` | DEVELOPMENT.md Einschränkung 2 auf einen Satz |
| R2-024 | ADR-007 Punkt 5, ADR-010 F2 Punkt 13, OD-Übersicht, Roadmap M3/G18 | DEVELOPMENT.md Z. 262-286, 289-293, 312-316 und Einschränkungen 8/9/11 → je ein Verweissatz |
| R2-025 | Statusdefinition Z. 762-764 | `ROADMAP:796` → „Fertig ist nicht abgenommen" |
| R2-026 | `src/app/navigation.tsx` | 29 Abnahmeschritte → „Organisatorisches → …" |
| R2-027 | OD-Übersicht | Spur-B-Tabelle: Zeilen E8, D, E10, E14 und „Erledigt"-Liste raus |
| R2-028 | ADR-019 (Rang 2), `MAP-LOOPS.md:229` | Vorbemerkung + Fassung-1-Korrekturen → Verweis; `ROADMAP:483`, `ARBEITSBEREICHE:206` → „MAP-006 ersetzt `/touren`" |
| R2-029 | Zielort der Idee (ADR/Prinzip/Bereich) | Hausregel `IDEENSPEICHER:78` ändern; 15 Einträge kürzen; E-16-Absätze und ADR-Protokoll im Journal raus |
| R2-030 | Funktionstabellen 1–13 | Preise/Kritik, Portalkriterien, „ohne Entsprechung", Spalte „Bei uns" entfallen |
| R2-031 | `main` | Klickliste (Branches, PR #37); `ROADMAP:815,816,819,821,843` → Hash/PR |
| R2-032 | `trennung.test.ts` (verschärft) | alle Importformen + Positivliste; Gegenprobe-Tests; VERBOTEN/ERLAUBTE_API_IMPORTE unverändert |
| R2-033 | — | 5 tote Symbole + Re-Export-Umweg löschen |
| R2-034 | neu `src/lib/datum.ts` | `formatDate` einmal; `heute()` → `todayInTimeZone` |
| R2-035 | `src/test-utils.tsx`, `supabase/tests/helpers/db.ts`, `tests/e2e/authenticated/helpers.ts` | `testAppointment()`, `tagInTagen`, `zeitImLauf`/`terminUeberOberflaeche`; Testanzahl unverändert |
| R2-036 | `ci.yml` `name:` | DEVELOPMENT.md nennt die fünf Anzeigenamen (Kennung in Klammern) |
| R2-037 | `ci.yml:115` | ANN-054 „Audit-Schwelle high" mit Anker-Kommentar in ci.yml; Skript `audit` entfällt |
| R2-038 | `eslint.config.js` Testblock | Regelausnahme nur für `*.test.*`; zwei begründete `eslint-disable-next-line`; falscher Kommentar/halber Disable raus → 0 Warnungen |
| R2-039 | `DEVELOPMENT.md` Stack-Start | `screenshots.mjs` verweist dorthin |

### 4.2 Zielstruktur (erwartete Zeilen)

| Datei | heute | Ziel | Was sich ändert |
| --- | --- | --- | --- |
| `CLAUDE.md` | 293 | **≤ 150** (~140) | Zweck 5 · Rangfolge 10 (Verweis §21) · Pflichtlektüre `docs/STATUS.md` 3 · ADR-Index 22 · Repository 8 · Befehle 12 · Cloud-Umgebung 10 · Harte Regeln 25 (Gate-Texte ungekürzt) · Arbeitsweise 30 (K1, Aufrufe, „Was bleibt ein Stopp", Verweise GRAPH/Skills/STATUS/SESSION-START) |
| `PROJECT_PRINCIPLES.md` | 1 550 | ~1 556 | nur 0.10.1 (§21, Vermerk); Kürzung → Vorschlag spätere Runde (im Vermerk 5.3 und im Bericht) |
| `README.md` | 66 | ~55 | Schnellstart verweist auf DEVELOPMENT.md; Rangliste → Verweis |
| `docs/STATUS.md` | — | **≤ 60** (~40) | neu, Gerüst 4.3 |
| `docs/DEVELOPMENT.md` | 404 | ~340 | R2-008/023/024/036/039, Klickliste ohne Auto-Merge (Anzeigenamen), Routine-Prompt-Vorschlag, Befehle `format`/`db:reset`/`test:watch`/`preview` |
| `docs/PRODUCT_VISION.md` | 349 | ~295 | Rangtabelle → Satz, Personal Training einmal, „umgebrandet" korrigiert |
| `docs/development/GRAPH-ENGINEERING-WORKFLOW.md` | 249 | ~190 | Pfad S → Knoten, Pfad D entfällt, Zweitreview verweist, + Tabelle „Wer ändert", + STATUS/SESSION-START in „Verankerung", Änderungsvermerk 1.1 |
| `docs/development/DEVELOPMENT_WORKFLOW.md` | 198 | **0** | entfällt |
| `docs/development/SESSION-START.md` | — | ~25 | aus der Vorlage (Abschnitt 4.4), drei Anpassungen |
| `docs/development/ROADMAP.md` | 859 | ~690 | „Nächster Loop" → Verweis auf STATUS + „Jannes-seitig", Antworten/Modelltabelle/erledigte Spur-B-Zeilen raus, Regeln verweisen, FIX-EPIC-001, Wochenupdate Schritt 1, Vermerk 5.3 |
| `docs/development/ARBEITSBEREICHE.md`, `BEFUNDE.md`, `OPTIMIERUNG.md` | 229 / 172 / 483 | 225 / 172 / 480 | nur Korrekturen |
| `docs/development/MAP-LOOPS.md`, `VER-EPIC-002.md` | 256 / 133 | 228 / 120 | Verweise statt Wiederholung |
| `docs/development/archiv/ROADMAP-AENDERUNGEN.md` | 35 | **0** | entfällt |
| `docs/development/fortschritt.json` | — | — | `fundament` → `fertig` |
| `docs/decisions/ASSUMPTIONS.md` | 3 575 | **≤ 800** (~600) | Einheitsstruktur 4.7, Kopf ~45 Z. |
| `docs/decisions/OPEN_DECISIONS.md` | 1 415 | **≤ 400** (~300) | Stubs 5–15 Z. je Punkt; Volltexte → ANFRAGEN.md |
| `docs/decisions/ANFRAGEN.md` | — | ~460 | neu: B1, B4, B5, B9, B10, B11, C6, E2 **unverändert** (Kennung als Überschrift, Kopfsatz mit Zweck und Rückverweis) |
| `docs/decisions/providerpruefung-kartendienst.md` | 172 | ~156 | Fassung-1-Korrekturen raus |
| `docs/decisions/archiv/OPEN_DECISIONS-erledigt.md` | 285 | **0** | entfällt |
| `docs/product/IDEENSPEICHER.md` + `ideen/*` | 259 + 4 023 | ~230 + ~3 760 | Hausregel, überführte Einträge, Wettbewerbsreferenz, Rangtabelle |
| `docs/adr/ADR-013…`, `docs/adr/README.md` | 204 / 115 | ~218 / ~118 | Fassung 3 |
| `docs/abnahme/*` | 2 905 | ~2 890 | nur Menüpfad, Nummerierung, Durchstreichungen; von Obergrenzen ausgenommen |
| `.claude/skills/feature-loop/SKILL.md`, `sandbox/SKILL.md` | 271 / 165 | ~255 / ~168 | K1 kurz (kein Pfad D), Zweitreview verweist, Freigabe-Stopp nach A, STATUS + `docs:check` in Schritt I, Auto-Merge raus, Modell → settings |
| `.claude/settings.json` | 13 | 14 | `"model": "opus"` |
| `scripts/docs-check.mjs` | — | ~120 | neu, ohne Abhängigkeiten |

Summe Markdown: 22 326 → ≈ 17 700 Zeilen (−21 %); Dateien 59 → 59 (−3 +3). Code −50 Zeilen; Tests −500 Zeilen bei gleicher Testzahl.

### 4.3 `docs/STATUS.md` (≤ 60)

```
# Status  ·  Stand JJJJ-MM-TT  ·  letzte Session: <Kennung> (PR #n)
## Jetzt
- <Kennung> — ein Satz · Aufruf: `/feature-loop …` · Pfad A/S · Effort: Default | xhigh
## Danach
- <Kennung> — ein Satz
- <Kennung> — ein Satz
## Blocker (Jannes-seitig)
- …
## Auf Abnahme warten
- <Kennungen>, Prüfschritte in docs/abnahme/
## Letzte Session
- was fertig wurde, PR, nach dem Merge lokal: git pull origin main [+ pnpm install | supabase db reset]
```
Regel: STATUS trägt nur Livestand; Reihenfolge bleibt ROADMAP, Befunde BEFUNDE.md, Ideen Ideenspeicher.
Skill-Schritt I und der Sandbox-Skill aktualisieren STATUS; `docs:check` prüft die 60 Zeilen.
Erstinhalt: Jetzt = ROL-EPIC-001 (Aufruf aus ROADMAP „Nächster Loop", Pfad A, Effort xhigh wegen Policies);
Danach = CAL-018, VER-EPIC-002; Blocker = Branch Protection (M0 30.09.), Anfragen B1/B2/B4, PTV-Schlüssel,
Routine-Prompt Schritt 6; Auf Abnahme warten = CAL-EPIC-003b, AKTE-000–005, UX-012, UI-002, FIX-EPIC-001,
FIX-EPIC-003, CAL-014–017, DAT-EPIC-001; Letzte Session = R2 Konsolidierung (PR-Nummer nach Erstellung).

### 4.4 `docs/development/SESSION-START.md` — Vorlage von Jannes (Wortlaut) und drei Anpassungen

Hochgeladene Vorlage (Datei `SESSION-START.md`, 2026-09-14):

```
# Standard-Startprompt für jede Folgesession (nach Konsolidierung R2)

Kopiere den Block unverändert in Claude Code. Nur die letzte Zeile wird ausgefüllt, wenn du etwas anderes willst als die nächste Aufgabe aus STATUS.md.

---

Lies `CLAUDE.md` und `docs/STATUS.md`. Nichts anderes vollständig lesen; weitere Dateien nur gezielt per `grep`/Zeilenbereich, wenn die Aufgabe sie braucht.

Aufgabe: die erste offene Aufgabe aus `docs/STATUS.md`, sofern unten nichts anderes steht. Nur diese eine Aufgabe, kein Vorgriff auf die nächste.

Ablauf:
1. Branch `claude/<aufgaben-kennung>` von `main`.
2. In drei Sätzen: was du baust, was du bewusst nicht baust, welche Prüfungen betroffen sind. Dann warten auf „Freigabe".
3. Nach Freigabe: bauen, kleine Commits, Prüfungen laufen lassen (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`, `pnpm test:db` nur bei Migrationen/Policies). Jede gemeldete Prüfung ist tatsächlich gelaufen.
4. `docs/STATUS.md` aktualisieren: Stand, nächste drei Aufgaben, Blocker. `pnpm docs:check` muss grün sein.
5. Push, PR gegen `main`. Kein Merge durch dich. Melde: PR-Link, CI-Status, was ich im Browser prüfen soll (max. 5 Klicks), was ich nach dem Merge ausführe.
6. Stopp. Keine Folgeaufgabe beginnen.

Regeln: Keine neue Abhängigkeit, kein neuer Anbieter, kein Security-/RLS-/Datenschutztest und kein CI-Gate abschwächen, keine echten Daten, keine Secrets. Annahmen nur als `ANN-NNN` mit Code-Anker; keine Doku-Datei über ihre Obergrenze wachsen lassen. Was nicht in diese Session passt, wird eine Zeile in STATUS.md, nicht gebaut.

Abweichende Aufgabe (optional):
```

Anpassungen (Widersprüche zu den Skills, je Auflösung):
1. „Nichts anderes vollständig lesen" → ergänzen: „…außer die im SPEC benannten ADRs (Pfad A)".
2. Schritt 2 (Freigabe-Stopp) → wird in den Feature-Loop-Skill übernommen (R2-F02 A): Schritt A endet
   mit drei Sätzen und „warten auf Freigabe"; CLAUDE.md „ohne Zwischenstopp" gilt ab Build.
3. „Was nicht in diese Session passt, wird eine Zeile in STATUS.md" → „…wird eine Zeile in ROADMAP
   (Aufgabe), BEFUNDE.md (Befund) oder Ideenspeicher (Idee); STATUS nennt nur die nächsten drei."
Ergänzung: „Migration/RLS/Policy/Zweitreview: Session mit `/effort xhigh`." Prüfbefehl in Schritt 3 um
`&& pnpm docs:check` ergänzen. Kein Merge durch die Session = deckungsgleich mit R2-002.

### 4.5 `pnpm docs:check` (Gate, verschärfend)

`scripts/docs-check.mjs` (nur `node:fs`/`node:path`), `package.json` `"docs:check": "node scripts/docs-check.mjs"`:
1. Obergrenzen: `CLAUDE.md` 150, `docs/STATUS.md` 60, `docs/decisions/ASSUMPTIONS.md` 800,
   `docs/decisions/OPEN_DECISIONS.md` 400 (Zeilen, `wc -l`-Semantik).
2. Jede `### ANN-NNN`-Überschrift in ASSUMPTIONS.md hat ≥ 1 Treffer `ANN-NNN` in `src/` (ohne `*.test.*`),
   `supabase/migrations/` oder `.github/workflows/`.
3. Jeder relative Markdown-Link (`[…](pfad)` ohne `http`, `mailto`, `#`) in allen getrackten `*.md`
   zeigt auf eine vorhandene Datei (Anker `#…` abschneiden).
Exit 1 mit Liste der Verstöße. CI: Schritt „Dokumentation (Obergrenzen, Register-Anker, Links)" im Job
`quality` nach „Lint" (R2-F05 A) → rot blockiert über den bestehenden Required Check. ADR-013 Fassung 3
nennt es als Prüfung 2.10 (R2-F04 A). Lint-Regeln von `eslint-plugin-security` gelten auch für das Skript
(Pfade sind Konstanten/`git ls-files`-Ausgabe; bei Warnung begründete `eslint-disable-next-line`).

### 4.6 Modell, DEVELOPMENT_WORKFLOW.md, Pfad D, ADR-013 Fassung 3, Prinzipien 0.10.1

- `.claude/settings.json` → `"model": "opus"` (zusätzlich zum Hook-Block). Per-Aufgabe-Effort kennt
  settings.json nicht → xhigh-Regel in SESSION-START.md. Konsequenz (in DEVELOPMENT.md nennen): In der
  Web-Oberfläche hat die Modellwahl beim Sessionstart Vorrang; für CLI-Sessions gilt die Datei.
- DEVELOPMENT_WORKFLOW.md entfällt (R2-001). Pfad D entfällt (R2-F03 A): K1 hat zwei Ausgänge (A, S) plus
  §15.1-Satz („Fehlt eine Hard-Stop-Entscheidung: Frage mit Optionen, Empfehlung, Konsequenzen stellen,
  Rest bauen"); Mermaid-Knoten D0 und Abschnitt „Pfad D" raus; beide Skills verlieren den Pfad-D-Satz;
  CLAUDE.md nennt nur A und S. Docs-Sessions bleiben Aufgaben in STATUS.md.
- ADR-013 Fassung 3 (eigener Commit, Änderungshistorie nach `docs/adr/README.md`, Status-Zeile in
  adr/README): Punkt 2 + Prüfung 2.10 `pnpm docs:check`; Nr. 8 „ohne Auto-Merge geführt" (Z. 111) →
  „wartet auf Jannes' Merge nach dem Zweitreview"; Z. 110 „(Opus 5 `xhigh`)" → „Modell und Aufwand nach
  `.claude/settings.json` und `docs/development/SESSION-START.md`".
- PROJECT_PRINCIPLES.md 0.10.1 (eigener Commit): §21 sechsstufige Rangfolge; ADR-Tabelle ohne
  Fassungs-/Statusvermerke; Dokumentinformation Version 0.10.1; Änderungsvermerk am Ende (Muster 0.2.1).
  Kürzungsvorschlag (1 550 Zeilen, ohne Regeländerung, eigene Docs-Session) nur notieren.

### 4.7 Einheitsstruktur `ASSUMPTIONS.md`

```
### ANN-030 — Beschäftigtendaten: Frist bis zum Ausscheiden plus …
Datenschutz · entschieden (Jannes) · 2026-09-11 · Prüfpaket · Wiedervorlage: Datenschutzprüfung
**Annahme.** 1–3 Sätze (Wortlaut der bisherigen Annahme, gekürzt, nicht umgedeutet).
**Begründung.** 1–2 Sätze mit Quellen (§ …, ADR-…, Leitlinie); drei, wenn zwei nicht reichen; Unsicheres bleibt als unsicher markiert.
**Anker.** `pfad/datei.ts` (`symbol`), Migration `2026…` — unverändert aus dem Feld Verankerung.
**Änderungspfad.** ein Satz · Aufwand klein/mittel/groß.
```
Optional eine Zeile `**Ablösung.**`/`**Herkunft.**`, wo das Feld heute belegt ist (Kennung erhalten).
≈ 10 Zeilen je Eintrag → 53 × 10 + Kopf 45 ≈ 575. Kopf: Zweck (3), Lebenszyklus-Tabelle (8), Aufbau
(10), Kennung im Code (6), Prüfpaket mit grep-Einzeiler
(`grep -n -A1 '^### ANN-' docs/decisions/ASSUMPTIONS.md | grep -E 'Datenschutz|Recht' | grep -v 'bestätigt'`) (5),
Historie-Einzeiler (1). Status-Token bleiben greppbar. Verworfene/überführte Einträge (ANN-006, ANN-036)
nach demselben Muster mit Verweis statt Annahme/Begründung.

`OPEN_DECISIONS.md`-Stub je Punkt: Überschrift, Status-Zeile (`vorläufig entschieden · Datum · Instanz`),
Entscheidung/Frage in ≤ 3 Sätzen, „Wo: ADR-/Roadmap G-Zeile", „Annahmen: ANN-…"; für die acht
Volltext-Punkte zusätzlich „Volltext: `ANFRAGEN.md` § <Kennung>". Übersichtstabelle (Z. 126-180) bleibt
als einzige Statusquelle, Spalten kürzen.

### 4.8 Löschliste

| Art | Objekt | Zeilen |
| --- | --- | --- |
| Datei | `docs/development/DEVELOPMENT_WORKFLOW.md` | 198 |
| Datei | `docs/decisions/archiv/OPEN_DECISIONS-erledigt.md` | 285 |
| Datei | `docs/development/archiv/ROADMAP-AENDERUNGEN.md` | 35 |
| Abschnitt | `OPEN_DECISIONS.md` Historie 1242-1415, Stand-Prosa 9-43, E14/E15/E-20-21/B15-Nachtrag Volltexte, F-Tabelle erledigte Zeilen, Benutzungsregeln 45-125 (bis auf 5 Z.); acht Volltexte → ANFRAGEN.md | ~520 (+458 verschoben) |
| Abschnitt | `ASSUMPTIONS.md` Journal 5-29, Übersicht 152-211, alle Begründungs-/Nachtragsvolltexte über die Einheitsstruktur hinaus | ~2 900 |
| Abschnitt | `ROADMAP.md` Antworten E-15–E-19 (726-759), Modelltabelle (677-696), Spur-B erledigte Zeilen + Erledigt-Liste, Etappe-T-Vorschlagssatz, Auto-Merge-Halbsätze, „Nächster Loop" → Verweis | ~110 |
| Abschnitt | `DEVELOPMENT.md` Go-live-Liste 262-286, Audit-Wiederholung, Einschränkungen 8/9/11, E2E-Satz | ~60 |
| Abschnitt | `GRAPH` Pfad S Regeln, Pfad D, Zweitreview-Mechanik | ~65 |
| Abschnitt | `MAP-LOOPS.md` 13-34, 215-218, 252-256; `providerpruefung` 99-110, 121-124; `VER-EPIC-002.md` 92-110 | ~60 |
| Abschnitt | `PRODUCT_VISION.md` Rangtabelle, Personal-Training-Doppel; `IDEENSPEICHER.md` Rangtabelle, Journal-Protokoll; 15 überführte Ideen; `referenz-wettbewerb.md` 45-63, 258-271, 273-300 | ~330 |
| Abschnitt | `CLAUDE.md` §15.1-Kurzfassung, Befehlskommentare, Umgebungs-Dopplungen, Loop-Regeln zweifach, Pfad D | ~150 |
| Branch | `origin/claude/focused-hopper-mwkc5d`, `origin/claude/praxissoftware-arch-graph-gc1a3u`, `origin/codex/plan-verordnung-office-20260913` (Klickliste) | — |
| PR | #37 schließen, nicht mergen (Klickliste) | — |
| Code | `restkontingent`, `gesamtkontingent`, `ersatzraeder`, `AppointmentKind`, `DocumentationStatus`, Re-Export `prescriptions/api.ts:570`; zwei `formatDate`-Kopien + `preview/format.ts:13`; `heute()`; `staffFullName`, `hhmm`, `fruehesteZuerst`, `standVon`, zwei tel-Regexe; 21 `export`-Schlüsselwörter | ~60 |
| Tests | 9 Appointment-Literale, 4 StaffMember-Literale, 13 `tagInTagen`, Spec-Helfer, 23 Router-Mocks | ~600 |
| Skripte/Config | package.json `test:all`, `audit`; ci.yml `fetch-depth: 0`; eslint `no-non-null-assertion: off`; `.gitignore` 10 Einträge | ~15 |

### 4.9 Klickliste (nur Jannes; in DEVELOPMENT.md „Manuelle Schritte" so aufnehmen)

1. Nach dem Merge (Git Bash): PR #37 auf GitHub schließen („über PR #39 als
   `docs/development/VER-EPIC-002.md` übernommen"), **nicht mergen**; dann
   `git fetch origin --prune && git push origin --delete claude/focused-hopper-mwkc5d claude/praxissoftware-arch-graph-gc1a3u codex/plan-verordnung-office-20260913`.
2. Branch Protection `main` (M0, 30.09.): Required Checks unter den Anzeigenamen „Lint, Typecheck, Tests,
   Build", „Migrationen und RLS-Policies", „Secret Scanning und Dependency Audit", „End-to-End",
   „End-to-End hinter der Anmeldung"; Force Push und Deletions aus; keine Pflicht-Approvals (ADR-013 Z. 62-63).
3. Repository-Einstellungen: „Automatically delete head branches" an; GitHub Secret Scanning + Push
   Protection an; Dependabot-Alerts an. „Allow auto-merge" entfällt (auf dem Plan nicht verfügbar).
4. Wochenupdate-Routine (`trig_01N5FanspQGxJP9S9rnZiZHj`, montags 07:50, Haiku 4.5): Prompt um
   `docs/STATUS.md` als erste Lesequelle und den Sandbox-Schritt (Tabelle „Sandbox-Prototypen" in
   `ARBEITSBEREICHE.md` §2, abgelaufene melden) ergänzen; fertigen Prompt-Text liefert Knoten 3 in
   DEVELOPMENT.md.
5. Lokal nach dem Merge: `git pull origin main`; kein `pnpm install` (Lockfile unverändert), kein
   `db reset` (keine Migration).

### 4.10 Fragen — alle Option A (entschieden)

| Kennung | Entscheidung |
| --- | --- |
| R2-F01 | Acht Volltexte unverändert nach `docs/decisions/ANFRAGEN.md`; OPEN_DECISIONS behält Stubs (~300 Z.) |
| R2-F02 | Freigabe-Stopp nach SPEC in den Feature-Loop-Skill: Schritt A endet mit drei Sätzen + „Freigabe" |
| R2-F03 | Pfad D entfällt (§15.1-Satz in K1) |
| R2-F04 | ADR-013 Fassung 3 bündelt 2.10 `docs:check`, Auto-Merge-Satz, Modellangabe |
| R2-F05 | `docs:check` als Schritt im Job `quality` |
| R2-F06 | ROADMAP „Nächster Loop" auf Verweis + „Jannes-seitig" kürzen; STATUS führt |
| R2-F07 | `settings.json` nur `"model": "opus"`; xhigh-Regel in SESSION-START |

### 4.11 Reihenfolge Knoten 3 (je Gruppe ein Commit, Kennungen in der Nachricht)

1. Löschen (R2-009/010/011/014/027/033, Sammelposten Skripte/Config) → `pnpm format:check`.
2. Zusammenlegen Register (R2-012/013/015 + Einheitsstruktur, ANFRAGEN.md, Sammelposten Register) →
   Invarianten-Skript (Abschnitt 1) und `docs:check`-Probelauf (Skript aus Gruppe 6 darf früher entstehen).
3. Zusammenlegen Steuerung (R2-001…008, 017, 018, 024, 028–030, Skills, Vision/Ideen) → Linkprüfung.
4. Korrigieren (R2-016, 019–023, 025, 026, 031, 036, 039, Sammelposten Roadmap/Abnahme) → Linkprüfung.
5. Code-Hygiene (R2-032–035, 037, 038, ci.yml, .gitignore, Sammelposten Code) →
   `pnpm lint && pnpm typecheck && pnpm test` (Testanzahl 1 462 belegen).
6. Betriebsmodell (STATUS.md, SESSION-START.md, docs-check.mjs, package.json, ci.yml-Schritt, settings.json).
7. `PROJECT_PRINCIPLES.md` 0.10.1 (eigener Commit). 8. ADR-013 Fassung 3 (eigener Commit).
9. Abschluss in einem Aufruf: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check`;
   Baseline-Messungen wiederholen; Push; PR gegen `main` (kein Auto-Merge, kein Merge); Knoten-4-Bericht.

Hinweise für die Umsetzung: `.prettierignore` schließt `PROJECT_PRINCIPLES.md`, `docs/adr/`, `docs/decisions/`,
`docs/product/`, `docs/development/` aus — dort Formatierung von Hand; `CLAUDE.md`, `README.md`,
`docs/DEVELOPMENT.md`, `docs/STATUS.md`, `docs/abnahme/` laufen durch Prettier (`pnpm format` vor dem Commit).
Der SessionStart-Hook (`.claude/hooks/session-start.sh`) installiert `node_modules` in Remote-Sessions.
Das Grep-Tool des Harness kann in dieser Umgebung mit einem Permission-Handler-Fehler scheitern — Bash
`grep -n`/`rg -n` nutzen.
