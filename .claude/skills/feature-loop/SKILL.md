---
name: feature-loop
description: Einzelauftrag an Datenmodell oder Rechten (Pfad A) - K1, Spec, Story für Story bauen, gezielt verifizieren (test:db, Bildstrecke), Review mit Checkliste aus ADR-013 Punkt 9 und Zweitreview, eine PR. Nur auf ausdrücklichen Aufruf mit /feature-loop <Auftrag>.
disable-model-invocation: true
---

# Feature-Loop

Für einen Auftrag, der kein ganzer Bereich ist (dafür `/bereich`): ein Epic, eine Liste von Epics
oder gebündelte Befunde. Regeln stehen in `CLAUDE.md`, den Prinzipien und den ADRs, hier nur die
Reihenfolge; ohne Zwischenstopp bis zur PR, anhalten nur nach `CLAUDE.md`. **K1** zuerst, in einem
Satz: Berührt der Diff einen Auslöser aus ADR-013 Punkt 9 (Liste nur dort), gilt **Pfad A** nach
`CLAUDE.md`, sonst gelten die Standardprüfungen.

## A. Spec (kurz, in die PR-Beschreibung)

- **Ziel** in einem Satz; **Stories** (`<KÜRZEL>-NNN`), je ein vertikaler Schnitt von der Datenbank
  bis zur Oberfläche, nach Abhängigkeit geordnet, die Befunde des Bereichs aus
  `docs/development/BEFUNDE.md` zuerst; **In/Out of Scope**; prüfbare **Akzeptanzkriterien**.
- **Sicherheit und Datenschutz:** Rollen, Sichtbarkeit, Audit (nur nach ADR-010), Datenminimierung;
  je neue Tabelle Datenklasse und Frist (`COMMENT`, `retention_assignments`), Löschpfad und ein
  `test:db`-Fall der Löschung; je Portalsicht der Negativfall „fremde Person“.
- **ADRs** nach dem Index in `CLAUDE.md`, nur diese ganz (bei RLS, Löschung und Abrechnung meist
  mehr als zwei); bei Oberfläche die Kernabläufe aus `docs/product/kernablaeufe.md` mit Budget.
- **Annahmen** nur, wo Spec, Prinzipien und ADRs schweigen, nach Recherche (Projektdokumente,
  Gesetz, Behördenleitlinien) und nach `CLAUDE.md`. Es wird nicht auf eine Freigabe gewartet.

## B. Build

Story für Story, je ein Commit mit Migration, Policy, RPC, Oberfläche, Tests und Annahmen, dazu was
die Akzeptanzkriterien brauchen (Seed, Testkonto, Datenklasse, Startinhalte), nichts, was ein
eigenes Epic wäre. Oberfläche nur nach `docs/design/DESIGN.md`. Erst die vermutete Stelle öffnen,
dann gezielt suchen; Subagenten für breite Suche.

## C. Verify

- **Je Story** nur das eng Betroffene: einzelne Testdatei, `pnpm typecheck`, bei Migrationen
  `pnpm test:db supabase/tests/<datei>` (Dateien dazu: `grep -l <name> supabase/tests`).
- **Am Ende** einmal der Prüfsatz aus `CLAUDE.md` und `pnpm build`, alle Testdateien zu geänderten
  Funktionen, Policies und Tabellen, die Gegenprobe ohne Migration (die volle Suite läuft in der
  CI); bei Oberfläche `pnpm bildstrecke` vorher/nachher bei 375 und 1280 px, selbst angesehen, und
  die betroffenen `pnpm test:e2e`. Keine identischen teuren Läufe ohne Änderung dazwischen; was
  aus Umgebungsgründen nicht lief, heißt „nicht gelaufen“.

## D. Review

Den eigenen Diff (`git diff main...HEAD`) prüfen auf Akzeptanzkriterien, ADR-Konformität, RLS statt
UI-Prüfung, Datenminimierung, verständliche Fehler ohne interne Details, fehlende Negativtests,
Secrets oder sensible Logs, unnötigen Scope; bei Oberfläche mit `.claude/agents/design-reviewer.md`
und `.claude/agents/praxis-reviewer.md`. **Pfad A:** die Review-Checkliste aus ADR-013 Punkt 9 je
Story Punkt für Punkt, „entfällt“ nur mit Begründung; ein roter Punkt geht zurück in den Build, nie
als „bekannte Einschränkung“ in die PR. Verlangt Nr. 8 einen **Zweitreview**, läuft
`.claude/agents/sicherheits-reviewer.md` in frischem Kontext mit nur Diff und Checkliste, vor dem
Merge; geht das nicht, nennt die PR ihn als ausstehend, und Jannes mergt erst danach. Konkrete
Fehler selbst beheben und gezielt erneut prüfen; Gates werden **nie** abgeschwächt.

## E. PR und Bericht

Branch auf `main` bringen, Push, PR gegen `main`, kein Merge. Doku nach `CLAUDE.md` („Doku je PR“),
in der PR dazu Zweitreview und Annahmen je ein Satz; in `fortschritt.json` `status`, `fertig_am`
und `nachweis`; `pnpm docs:check` grün. Bericht im Chat nach `CLAUDE.md`.
