# R2 Konsolidierung — Zwischenstand Knoten 3

**Temporär. Wird zusammen mit `R2-ARBEITSANWEISUNG.md` im letzten Commit von
Knoten 4 gelöscht.** Liegt im Repository statt in `/tmp`, weil eine neue Session
einen frischen Container bekommt und `/tmp` dort leer ist.

Stand: 2026-09-15, nach Gruppe 3. Branch `claude/konsolidierung-r2`,
Baseline `7160fd5`.

## Erledigt

| Gruppe | Commit | Inhalt | Prüfungen |
| --- | --- | --- | --- |
| 1 Löschen | `da06e75` | R2-009/010/011/014/027/033, Sammelposten Skripte/Config | `format:check`, `lint` (0 Fehler, 6 Warnungen wie Baseline), `typecheck`, `test` (92 Dateien, 1 462 Tests) — alle grün |
| 2 Register | `3e982f3` | R2-012/013/015, Einheitsstruktur 4.7, ANFRAGEN.md (R2-F01), Sammelposten Register | Invarianten-Skript, Anker-Abgleich (53/53), Linkprüfung, `format:check` — alle grün |
| 3a Steuerung | `2c2cf07` | R2-001…004, 006…008, 017, 018, 024, 028; DEVELOPMENT_WORKFLOW.md gelöscht; GRAPH 1.1; Roadmap-Vermerk 5.3 angelegt | `prettier --check` der geänderten Prettier-Dateien, Linkprüfung (59 Dateien, nur die zwei bekannten Beispielpfade in den R2-Dateien) — grün |
| 3b Skills, Vision, Ideen | `ad63f99` | R2-002/003/005/006 in den Skills, R2-F02 Freigabe-Stopp, R2-F03, R2-029, R2-030, Sammelposten Vision/Ideen | wie 3a — grün |

Zeilen: `ASSUMPTIONS.md` 3 575 → 734 · `OPEN_DECISIONS.md` 1 415 → 400 ·
`ANFRAGEN.md` neu 483 · `ROADMAP.md` 859 → 785 · `CLAUDE.md` 293 → 149 ·
`README.md` 66 → 57 · `DEVELOPMENT.md` 404 → 363 · GRAPH 249 → 188 ·
`MAP-LOOPS.md` 256 → 243 · `providerpruefung` 172 → 158 · `PRODUCT_VISION.md`
349 → 311 · `IDEENSPEICHER.md` 259 → 224 · `10-praxisverwaltung.md` 1 178 → 972 ·
`07-ki-assistenz.md` 203 → 164 · `referenz-wettbewerb.md` 315 → 239 ·
feature-loop 271 → 247 · sandbox 165 → 167 · drei Dateien gelöscht.

## Offen — Reihenfolge nach Arbeitsanweisung 4.11

4. Korrigieren (R2-016, 019–023, 025, 026, 031, 036, 039, Sammelposten
   Roadmap/Abnahme) → Linkprüfung. Dazu: Vermerk 5.3 um den Skriptwert
   (31,2 %) ergänzen; `VER-EPIC-002.md:92-110` Prozessabsatz → Verweis.
5. Code-Hygiene (R2-032–035, 037, 038, ci.yml, .gitignore, Sammelposten Code) →
   `lint && typecheck && test`, Testanzahl 1 462 belegen. Dazu aus dem
   Sammelposten Gates/Skripte: `DEVELOPMENT.md` Befehle `format`, `db:reset`,
   `test:watch`, `preview`; Supabase-CLI-Version nur an einer Stelle
   (`DEVELOPMENT.md` Z. 73-79, 108-110 verweisen).
6. Betriebsmodell (STATUS.md, SESSION-START.md, docs-check.mjs, package.json,
   ci.yml-Schritt, settings.json). Dazu: ROADMAP „Nächster Loop" auf Verweis +
   „Jannes-seitig" (R2-F06); Feature-Loop-Schritt I und Sandbox-Skill
   aktualisieren STATUS und rufen `docs:check`; GRAPH „Verankerung" um
   STATUS, SESSION-START und settings.json.
7. `PROJECT_PRINCIPLES.md` 0.10.1 (eigener Commit).
8. ADR-013 Fassung 3 (eigener Commit; Z. 111 ist die letzte Auto-Merge-Stelle).
9. Abschlusslauf in einem Aufruf, Baseline-Messungen wiederholen, Push, PR gegen
   `main` (kein Merge durch die Session), Knoten-4-Bericht.

## Abweichungen von der Arbeitsanweisung (im Bericht zu nennen)

1. **`.gitignore` (Gruppe 1):** Acht der zehn genannten Einträge sind raus,
   `secrets/` und `.secrets` bleiben. Sie sind das einzige Muster, das
   Schlüsselmaterial außerhalb von `.env*` erfasst; ihr Wegfall wäre eine
   Lockerung an einer MUSS-Anforderung (`PROJECT_PRINCIPLES.md` §3.3) für zwei
   Zeilen Gewinn (§16). Jannes kann das überstimmen.
2. **`Herkunft` im Register (Gruppe 2):** Abschnitt 1 („Zielgrößen") lässt je
   Eintrag nur Kopf, Aussage, Anker, Änderungspfad, Wiedervorlage und eine Zeile
   Begründung zu, Abschnitt 4.7 nennt zusätzlich eine optionale Zeile
   `Herkunft`. Aufgelöst zugunsten von Abschnitt 1: `Ablösung` bleibt (sie trägt
   ANN-Querverweise), `Herkunft` geht in der Begründung auf, deren Quellen
   ohnehin verlangt sind.
3. **Prüfpaket-Filter:** Der in 4.7 vorgeschlagene Filter über
   `Datenschutz|Recht` trifft auch Einträge, deren Wiedervorlage das Wort
   „Datenschutzprüfung" enthält. Verwendet wird stattdessen der Zusatz
   `Prüfpaket` der Statuszeile; er deckt sich exakt mit dem Kategoriefilter
   (29 Einträge, beide Richtungen geprüft).
4. **R2-033:** Die Arbeitsanweisung sagt, `PrescriberFormPage.tsx:19` und
   `PrescriptionFormPage.tsx:26` importierten bereits direkt aus
   `@/lib/abstecher`. Sie importierten aus `./api`; beide Seiten wurden auf den
   direkten Import umgestellt, damit der Re-Export entfallen konnte.
5. **`fetch-depth: 0` (Gruppe 1):** entfernt, nachdem geprüft wurde, dass
   `scripts/scan-secrets.sh` nur den Arbeitsbaum liest (`git ls-files`,
   `git grep`) und keine Historie — das Gate verliert nichts.

Jannes hat am 2026-09-15 „die vier Abweichungen aus Gruppe 1/2" bestätigt; die Liste zählt fünf — Nr. 5 im Bericht ausdrücklich nennen.

Gruppe 3, im Bericht zu nennen (keine Abweichung in der Sache):

6. **Vorgriff auf Gruppe 6:** Wochenupdate Schritt 1, der Modellabschnitt der
   Roadmap und `OPTIMIERUNG.md` nennen `docs/STATUS.md`,
   `docs/development/SESSION-START.md` und `.claude/settings.json` schon jetzt
   (als Code, nicht als Link). Bis Gruppe 6 fehlen diese Dateien noch.
7. **Nicht angefasst:** `OPTIMIERUNG.md` Z. 406 und 420-422 nennen weiter
   Modelle (Nachzugstabelle und Aufwand je Runde, eingefroren) — die Datei
   bekommt nur Korrekturen. Die Roadmap-Chronik 5.2 nennt weiter
   `DEVELOPMENT_WORKFLOW.md` (Chronik, kein Link).
8. **`CLAUDE.md` „Annahmen statt Rückfragen":** Die fünf Schritte stehen nur
   noch in §15.1; die frühere Abweichung (Punkt 5 „Im Bericht nennen" statt
   „Validieren lassen", R2-004) ist damit aufgelöst. Die Berichtspflicht für
   Annahmen steht im Feature-Loop-Schritt I und in „Abschlussbericht".

## Für Gruppe 6 und 9 vormerken

- `docs:check` Prüfung 3 (relative Links) schlägt auf dem Beispielpfad
  `[…](pfad)` in `R2-ARBEITSANWEISUNG.md` Abschnitt 4.5 und in dieser Datei an.
  Beide Dateien fallen in Knoten 4; bis dahin die Klammerform entschärfen
  (Backticks statt Link) — das Gate bleibt unangetastet.
- **Windows-Arbeitskopie:** Diese Session läuft lokal unter Windows mit
  `core.autocrlf=true`. `pnpm format:check` über den ganzen Baum meldet dort
  348 Dateien wegen CRLF, auch unberührte (`src/main.tsx`). Geprüft wird
  deshalb je geänderter Datei; der Abschlusslauf in einem Aufruf braucht eine
  LF-Arbeitskopie (Cloud-Session oder `git worktree` mit
  `core.autocrlf=false`), sonst ist er nicht aussagekräftig.
- Seit Gruppe 1 steht `supabase/.branches/` nicht mehr in `.gitignore`; lokal
  taucht das Verzeichnis als untracked auf. Nicht committen; im Bericht nennen.

## Werkzeuge

Die Skripte der Gruppen 3a und 3b (`g3a.mjs`, `g3b.mjs`, `links.mjs`) lagen im
lokalen Scratchpad und werden nicht mehr gebraucht. Der Vergleich gegen den
Stand vor dem Umbau geht über `git show 7160fd5:<pfad>`.
